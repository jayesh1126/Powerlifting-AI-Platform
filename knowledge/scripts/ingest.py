from pathlib import Path
import hashlib
import os

import httpx
import frontmatter
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)
from dotenv import load_dotenv
from openai import OpenAI


ENV = Path(__file__).resolve().parent.parent / ".env"   # knowledge/.env
load_dotenv(ENV)

client = OpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)
EMBED_MODEL = "openai/text-embedding-3-large"

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
TABLE = "knowledge_base_embeddings_v2"


def embed(text: str) -> list[float]:
    resp = client.embeddings.create(model=EMBED_MODEL, input=text)
    return resp.data[0].embedding


DOCS = Path(__file__).resolve().parent.parent / "docs"


def chunk(body: str):
    """Two-stage split: by markdown header, then into token-bounded pieces.
    Returns a list of langchain Documents (each has .page_content + .metadata)."""
    header_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")],
        strip_headers=False,
    )
    sections = header_splitter.split_text(body)

    token_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=500,
        chunk_overlap=80,
    )
    return token_splitter.split_documents(sections)


def build_rows(path: Path) -> list[dict]:
    """One markdown file -> a list of DB-ready rows (no embedding yet)."""
    post = frontmatter.load(str(path))
    meta = post.metadata
    parent_doc_id = path.stem              # "test-squat" — stable identity for this source

    rows = []
    for i, doc in enumerate(chunk(post.content)):
        content = doc.page_content

        # Deterministic context from the header path — free, no LLM call.
        header_path = " > ".join(
            doc.metadata[h] for h in ("h1", "h2", "h3") if doc.metadata.get(h)
        )
        context = f"From '{meta['title']}'"
        if header_path:
            context += f" — section: {header_path}"

        embed_input = f"{context}\n\n{content}"   # what we'll actually embed next step

        rows.append({
            "parent_doc_id": parent_doc_id,
            "chunk_index": i,
            "content_hash": hashlib.md5(embed_input.encode()).hexdigest(),
            "source_url": meta.get("source_url", ""),
            "source_type": meta.get("source_type", "article"),
            "title": meta.get("title", "untitled"),
            "author": meta.get("author"),
            "licence": meta.get("licence"),
            "context": context,
            "content": content,
            "topics": meta.get("topics", []),
        })
    return rows

def embed_rows(rows: list[dict]) -> None:
    """Embed each row in place, adding the 'embedding' field."""
    for r in rows:
        vec = embed(f"{r['context']}\n\n{r['content']}")
        r["embedding"] = str(vec)          # "[0.011, 0.0008, ...]" — halfvec text form
        print(f"  embedded {r['parent_doc_id']}#{r['chunk_index']}")


def upsert_rows(rows: list[dict]) -> None:
    """Upsert on the (parent_doc_id, chunk_index) unique key."""
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}?on_conflict=parent_doc_id,chunk_index"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    resp = httpx.post(url, json=rows, headers=headers, timeout=30)
    resp.raise_for_status()

def existing_hashes(parent_doc_id: str) -> dict[int, str]:
    """chunk_index -> content_hash already stored for this doc."""
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}"
    params = {"parent_doc_id": f"eq.{parent_doc_id}", "select": "chunk_index,content_hash"}
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    resp = httpx.get(url, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    return {row["chunk_index"]: row["content_hash"] for row in resp.json()}


def delete_chunks(parent_doc_id: str, indexes: list[int]) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{TABLE}"
    params = {"parent_doc_id": f"eq.{parent_doc_id}",
              "chunk_index": f"in.({','.join(map(str, indexes))})"}
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    resp = httpx.delete(url, params=params, headers=headers, timeout=30)
    resp.raise_for_status()


def ingest_file(path: Path) -> None:
    rows = build_rows(path)
    parent = path.stem
    have = existing_hashes(parent)

    # embed + upsert only chunks that are new or whose text changed
    changed = [r for r in rows if have.get(r["chunk_index"]) != r["content_hash"]]
    if changed:
        embed_rows(changed)
        upsert_rows(changed)

    # delete chunks that no longer exist (doc was re-chunked into fewer pieces)
    current = {r["chunk_index"] for r in rows}
    stale = [idx for idx in have if idx not in current]
    if stale:
        delete_chunks(parent, stale)

    print(f"{parent}: {len(changed)} upserted, {len(rows) - len(changed)} unchanged, {len(stale)} stale-deleted")


if __name__ == "__main__":
    for path in sorted(DOCS.glob("*.md")):
        ingest_file(path)


