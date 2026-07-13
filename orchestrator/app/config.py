from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Loaded from environment / .env.

    Only INTERNAL_API_KEY is required. Everything else degrades gracefully:
    without an LLM key the runtime falls back to a heuristic planner and a
    stub generator, so the end-to-end flow keeps working in dev.
    """

    internal_api_key: str

    # --- LLM providers -----------------------------------------------------
    # Chat models go through OpenRouter (OpenAI-compatible API).
    openrouter_api_key: str | None = None
    llm_base_url: str = "https://openrouter.ai/api/v1"
    # Embeddings prefer a direct OpenAI key (must match the model that
    # embedded markdown_chunks); falls back to OpenRouter if unset.
    openai_api_key: str | None = None

    # Model roles — tune quality vs. cost per stage, in one place.
    planner_model: str = "meta-llama/llama-3.1-8b-instruct"
    generator_model: str = "openai/gpt-4.1-nano"
    summarizer_model: str = "meta-llama/llama-3.1-8b-instruct"
    embedding_model: str = "text-embedding-3-large"

    # --- Data stores --------------------------------------------------------
    # Supabase (pgvector knowledge base) — for retrieval.
    supabase_url: str | None = None
    supabase_secret_key: str | None = None

    # OpenPowerlifting meet-results Postgres (read-only, same docker network).
    opl_database_url: str | None = None

    # --- Runtime knobs -------------------------------------------------------
    max_tool_rounds: int = 5
    max_tool_result_chars: int = 20_000

    # --- Logging --------------------------------------------------------------
    log_level: str = "INFO"
    log_format: str = "text"  # "json" in production (see infra/docker-compose.yml)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
