from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Loaded from environment / .env. Only INTERNAL_API_KEY is required
    for the skeleton; the rest come online as pipelines are ported."""

    internal_api_key: str

    openrouter_api_key: str | None = None
    openai_api_key: str | None = None

    supabase_url: str | None = None
    supabase_secret_key: str | None = None
    neo4j_uri: str | None = None
    neo4j_user: str | None = None
    neo4j_password: str | None = None
    postgres_dsn: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
