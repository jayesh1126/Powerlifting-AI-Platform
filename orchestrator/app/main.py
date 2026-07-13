from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.logging_setup import RequestIdMiddleware, configure_logging
from app.routers.chat import router as chat_router
from app.tools.opl import close_opl_pool
from app.tools.retrieval import close_http_client

_settings = get_settings()
configure_logging(_settings.log_level, _settings.log_format)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    # Connections are opened lazily on first use; release them on shutdown.
    await close_opl_pool()
    await close_http_client()


app = FastAPI(
    title="PowerliftingAI Orchestrator",
    description=(
        "The AI runtime. Called only by the Next.js gateway with a shared "
        "internal API key — never exposed to browsers directly."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(RequestIdMiddleware)
app.include_router(chat_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
