"""Knowledge retrieval over the pgvector markdown chunks.

Port of the old LangchainUtil.server.ts pipeline, without LangChain:

    query -> rewrite + topic extraction (cheap LLM, JSON output)
          -> query embedding
          -> Supabase RPC hybrid_match_markdown_chunks_v2
             (vector similarity + full-text search + topic filter)
          -> RetrievedContext (documents + citations)

The output is deliberately prompt-free: documents and scores only. The
generator decides how to phrase them into context.
"""

import json
import logging

import httpx
from pydantic import BaseModel, Field

from app.config import get_settings
from app.llm import get_chat_client, get_embeddings_client
from app.tools.base import Tool

logger = logging.getLogger(__name__)

# Shared connection pool for Supabase RPC calls; closed from the app lifespan.
_http: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=15)
    return _http


async def close_http_client() -> None:
    global _http
    if _http is not None:
        await _http.aclose()
        _http = None


# Topic vocabulary the knowledge-base chunks are tagged with. The rewrite
# model must pick from this list so topic filtering matches the metadata.
CANONICAL_TOPICS = [
    # Core lifts
    "squat", "bench", "deadlift",
    # Technique & movement
    "technique", "positioning", "bracing", "variations", "accessories",
    # Programming & training theory
    "programming", "periodization", "peaking", "tapering", "deload",
    "fatigue_management", "volume", "rpe", "specificity", "progress",
    "training_plateaus",
    # Injuries & rehab
    "injuries", "rehab", "pain_management", "lower_back", "hypermobility",
    "sciatica",
    # Competition & rules
    "competition", "meet_prep", "ipf_rules", "weight_class", "externals",
    # Physiology & lifestyle
    "recovery", "diet", "cutting", "mental", "muscle",
    # Equipment
    "equipment",
]

DEFAULT_PROGRAM_TOPICS = [
    "programming", "recovery", "injuries", "rehab", "pain_management",
    "periodization", "peaking", "tapering", "deload", "fatigue_management",
    "volume", "rpe", "specificity", "progress", "training_plateaus",
]


class RetrievedDoc(BaseModel):
    id: int | str
    content: str
    metadata: dict = {}
    similarity: float | None = None
    hybrid_score: float | None = None


class RetrievedContext(BaseModel):
    documents: list[RetrievedDoc] = []
    standalone_query: str | None = None
    topics: list[str] = []


class RewriteResult(BaseModel):
    standaloneQuery: str
    topics: list[str] = []


async def _rewrite_query(query: str) -> RewriteResult:
    """Rewrite the user query into a standalone question + canonical topics.
    Falls back to the raw query (no topic filter) if no LLM is available."""
    client = get_chat_client()
    if client is None:
        return RewriteResult(standaloneQuery=query, topics=[])

    settings = get_settings()
    system_prompt = f"""You rewrite user queries for a powerlifting knowledge base.

Your tasks:
1. Produce "standaloneQuery": a clean standalone version of the user's question.
2. Produce "topics": a list of canonical topics relevant to the query.

You MUST choose topics ONLY from this list:
{chr(10).join(f"- {t}" for t in CANONICAL_TOPICS)}

Rules:
- Use ONLY items from the list above.
- Choose ALL that are relevant. If unsure, pick a broader category.
- Output JSON ONLY, no explanations.

Expected JSON:
{{"standaloneQuery": string, "topics": string[]}}"""

    try:
        response = await client.chat.completions.create(
            model=settings.planner_model,
            temperature=0,
            max_tokens=300,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query},
            ],
        )
        result = RewriteResult.model_validate_json(response.choices[0].message.content or "{}")
        # Drop hallucinated topics instead of failing the request.
        result.topics = [t for t in result.topics if t in CANONICAL_TOPICS]
        logger.info("rewrite: %r topics=%s", result.standaloneQuery, result.topics)
        return result
    except Exception:
        logger.exception("query rewrite failed, using raw query")
        return RewriteResult(standaloneQuery=query, topics=[])


async def _embed(text: str) -> list[float] | None:
    client = get_embeddings_client()
    if client is None:
        return None
    settings = get_settings()
    try:
        response = await client.embeddings.create(model=settings.embedding_model, input=text)
        return response.data[0].embedding
    except Exception:
        logger.exception("embedding failed")
        return None


async def _hybrid_search(
    embedding: list[float], query_text: str, topics: list[str], top_k: int
) -> list[RetrievedDoc]:
    """Call the Supabase hybrid_match_markdown_chunks_v2 RPC directly over
    PostgREST — same RPC the old app called through supabase-js."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        logger.warning("Supabase not configured — retrieval returns nothing")
        return []

    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/hybrid_match_markdown_chunks_v2"
    payload = {
        "query_embedding": json.dumps(embedding),
        "query_text": query_text,
        "topics": topics,
        "match_count": top_k,
    }
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
        "Content-Type": "application/json",
    }
    try:
        res = await get_http_client().post(url, json=payload, headers=headers)
        res.raise_for_status()
        data = res.json()
    except Exception:
        logger.exception("hybrid search RPC failed")
        return []

    if not isinstance(data, list):
        logger.warning("hybrid search RPC returned non-list")
        return []
    return [RetrievedDoc.model_validate(row) for row in data]


async def retrieve_knowledge(
    query: str, extra_topics: list[str] | None = None, top_k: int = 5
) -> RetrievedContext:
    """Full retrieval pipeline. Structured entrypoint used by the runtime;
    the Tool wrapper below exposes the same thing to the LLM if needed."""
    rewrite = await _rewrite_query(query)
    topics = sorted(set(rewrite.topics) | set(extra_topics or []))

    embedding = await _embed(rewrite.standaloneQuery)
    if embedding is None:
        return RetrievedContext(standalone_query=rewrite.standaloneQuery, topics=topics)

    docs = await _hybrid_search(embedding, rewrite.standaloneQuery, topics, top_k)
    logger.info("retrieval returned %d docs", len(docs))
    return RetrievedContext(
        documents=docs, standalone_query=rewrite.standaloneQuery, topics=topics
    )


class RetrieveKnowledgeParams(BaseModel):
    query: str = Field(description="A standalone question to search the knowledge base with")


class RetrieveKnowledgeTool(Tool):
    """Tool-interface wrapper so retrieval is uniform with every other
    capability. The runtime currently invokes retrieve_knowledge() directly
    (planner-gated), but this lets the generator pull extra knowledge
    mid-conversation later without any new plumbing."""

    name = "retrieve_powerlifting_knowledge"
    description = (
        "Search the curated powerlifting knowledge base (technique, programming, "
        "injuries, competition rules) and return relevant excerpts."
    )
    params_model = RetrieveKnowledgeParams

    async def execute(self, args: RetrieveKnowledgeParams) -> str:
        ctx = await retrieve_knowledge(args.query)
        return json.dumps([d.model_dump() for d in ctx.documents])
