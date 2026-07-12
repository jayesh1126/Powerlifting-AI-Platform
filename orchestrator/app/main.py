import logging

from fastapi import FastAPI

from app.routers.chat import router as chat_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="PowerliftingAI Orchestrator",
    description=(
        "Internal service that runs the RAG/LLM pipelines. Called only by "
        "the Next.js gateway with a shared internal API key — never "
        "exposed to browsers directly."
    ),
    version="0.1.0",
)

app.include_router(chat_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
