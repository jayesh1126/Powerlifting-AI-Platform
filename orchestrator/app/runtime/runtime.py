"""Entry point of the AI runtime: drives the LangGraph flow and turns its
custom stream events into NDJSON lines for the gateway (`token` events
first, then `citations` / `summary` / `metrics` / `end`).
"""

import logging
from collections.abc import AsyncIterator

from app.metrics import RequestMetrics
from app.models import ChatStreamRequest, EndEvent, ErrorEvent, ndjson
from app.runtime.graph import RUNTIME_GRAPH

logger = logging.getLogger(__name__)


async def run_chat(request: ChatStreamRequest) -> AsyncIterator[str]:
    metrics = RequestMetrics(user_id=request.user_id, chat_id=request.chat_id)
    try:
        async for event in RUNTIME_GRAPH.astream(
            {"request": request, "metrics": metrics},
            stream_mode="custom",
        ):
            yield ndjson(event)
        yield ndjson(EndEvent())
    except Exception:
        logger.exception("runtime failed chat=%s", request.chat_id)
        yield ndjson(ErrorEvent(message="The AI runtime failed to produce a response."))
    finally:
        metrics.log()
