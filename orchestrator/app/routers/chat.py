import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.models import ChatStreamRequest, SummarizeRequest, SummarizeResponse
from app.orchestrator import run_orchestrator
from app.security import verify_internal_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", dependencies=[Depends(verify_internal_api_key)])


@router.post("/chat/stream")
async def chat_stream(req: ChatStreamRequest) -> StreamingResponse:
    """Streams the LLM answer as plain UTF-8 text chunks.

    The Next.js gateway has already authenticated the user and verified
    chat ownership + quota before calling this.
    """
    logger.info(
        "chat/stream user=%s chat=%s mode=%s", req.user_id, req.chat_id, req.mode
    )
    return StreamingResponse(
        run_orchestrator(req),
        media_type="text/plain; charset=utf-8",
    )


@router.post("/summarize")
async def summarize(req: SummarizeRequest) -> SummarizeResponse:
    """Produces an updated rolling summary of the conversation.

    TODO: port getNewChatSummary from openai.server.ts (LLM call that
    merges existing_summary with the new messages).
    """
    tail = req.messages[-4:]
    naive = " | ".join(f"{m.role}: {m.content[:80]}" for m in tail)
    summary = (req.existing_summary + " | " if req.existing_summary else "") + naive
    return SummarizeResponse(summary=summary[-1500:])
