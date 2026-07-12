import asyncio
from collections.abc import AsyncIterator

from app.models import ChatStreamRequest

STUB_RESPONSE = (
    "**[stub — retrieval handler]** This response comes from the Python "
    "orchestrator skeleton.\n\n"
    "The real implementation will: embed the query, run hybrid vector "
    "search over the markdown knowledge chunks, expand Neo4j graph "
    "neighbours (cues, injuries, exercises), and stream an LLM answer "
    "with citations.\n\n"
    "Your question was: "
)


async def handle_retrieval(req: ChatStreamRequest) -> AsyncIterator[str]:
    """RAG over powerlifting knowledge (port of RetrievalHandler.server.ts).

    TODO: port the LangChain retrieval pipeline from the old app:
      - embed query (OpenAI embeddings)
      - Supabase hybrid_match_markdown_chunks RPC
      - Neo4j graph expansion
      - streaming LLM completion with summary + last_messages as context
    """
    for token in (STUB_RESPONSE + f'"{req.message}"').split(" "):
        yield token + " "
        await asyncio.sleep(0.02)  # simulate LLM token cadence
