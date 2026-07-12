"""Shared LLM clients.

One place decides which provider each capability uses; the rest of the
runtime just asks for "the chat client" or "the embeddings client".
"""

from functools import lru_cache

from openai import AsyncOpenAI

from app.config import get_settings


@lru_cache
def get_chat_client() -> AsyncOpenAI | None:
    """OpenAI-compatible client for chat models (OpenRouter).

    Returns None when no key is configured — callers must degrade
    gracefully (heuristic planner, stub generator).
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        return None
    return AsyncOpenAI(
        api_key=settings.openrouter_api_key,
        base_url=settings.llm_base_url,
    )


@lru_cache
def get_embeddings_client() -> AsyncOpenAI | None:
    """Client for query embeddings.

    Must produce vectors compatible with those stored in markdown_chunks
    (text-embedding-3-large), so a direct OpenAI key is preferred.
    """
    settings = get_settings()
    if settings.openai_api_key:
        return AsyncOpenAI(api_key=settings.openai_api_key)
    if settings.openrouter_api_key:
        return AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.llm_base_url,
        )
    return None
