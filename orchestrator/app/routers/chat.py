import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.models import ChatStreamRequest
from app.runtime import run_chat
from app.security import verify_internal_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", dependencies=[Depends(verify_internal_api_key)])


@router.post("/chat/stream")
async def chat_stream(req: ChatStreamRequest) -> StreamingResponse:
    """The one AI endpoint. Streams NDJSON events (see app.models):
    `token` lines while generating, then `citations` / `summary` /
    `metrics` / `end`.

    The Next.js gateway has already authenticated the user and verified
    chat ownership + quota; it forwards token text to the browser and
    persists everything else.
    """
    logger.info(
        "chat/stream user=%s chat=%s messages=%d total=%d sub=%s",
        req.user_id,
        req.chat_id,
        len(req.messages),
        req.total_message_count,
        req.user_context.subscription,
    )
    return StreamingResponse(run_chat(req), media_type="application/x-ndjson")
