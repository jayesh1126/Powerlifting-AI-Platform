import logging
from collections.abc import AsyncIterator

from app.handlers.analytics import handle_analytics
from app.handlers.program import handle_program
from app.handlers.retrieval import handle_retrieval
from app.models import ChatStreamRequest

logger = logging.getLogger(__name__)


def run_orchestrator(req: ChatStreamRequest) -> AsyncIterator[str]:
    """Routes a chat request to the right pathway.

    Port of ChatbotOrchestrator.server.ts:
      - "general"                    -> retrieval (RAG on markdown knowledge)
      - "program"                    -> program design
      - "openpowerlifting_analytics" -> analytics agent (SQL tools)
    Unknown modes fall back to retrieval.
    """
    match req.mode:
        case "program":
            logger.info("Routing to program handler")
            return handle_program(req)
        case "openpowerlifting_analytics":
            logger.info("Routing to analytics handler")
            return handle_analytics(req)
        case _:
            logger.info("Routing to retrieval handler")
            return handle_retrieval(req)
