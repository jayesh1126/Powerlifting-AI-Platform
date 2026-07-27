import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.instrumentation import record_request
from app.metrics import RequestMetrics
from app.models import (
    ProgramNormalizeRequest,
    ProgramNormalizeResponse,
    ProgramSuggestRequest,
)
from app.runtime.program_ops import (
    NormalizationError,
    NormalizationTruncatedError,
    normalize_program,
    run_program_suggest,
)
from app.security import verify_internal_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", dependencies=[Depends(verify_internal_api_key)])


@router.post("/programs/normalize")
async def programs_normalize(req: ProgramNormalizeRequest) -> ProgramNormalizeResponse:
    """Pasted program text -> canonical Program JSON with node ids, or a
    rejection (`is_program: false`) when the text isn't a program.

    Plain JSON, not a stream — a single structured document gains nothing
    from streaming. The gateway has already authenticated the user and
    checked the AI-actions quota; it charges quota only on a 200.
    """
    logger.info("programs/normalize user=%s chars=%d", req.user_id, len(req.program_text))
    metrics = RequestMetrics(user_id=req.user_id, chat_id="program:normalize")
    outcome = "ok"
    try:
        with metrics.timer("normalize"):
            result = await normalize_program(req.program_text, metrics)
        if not result.is_program:
            # The system worked; the input wasn't a program. Distinct
            # outcome so error-rate panels don't count user behavior.
            outcome = "rejected"
        return result
    except NormalizationTruncatedError:
        # Output hit the token ceiling — a size problem, not a failure.
        # Distinct status so the gateway can tell the user to split the
        # program instead of showing a generic error.
        outcome = "error"
        logger.warning("programs/normalize output truncated (program too large)")
        raise HTTPException(
            status_code=422,
            detail="This program is too large to import in one piece — try splitting it into blocks.",
        )
    except NormalizationError:
        # The LLM failed schema validation twice — an upstream failure from
        # this service's perspective, hence 502.
        outcome = "error"
        logger.exception("programs/normalize failed validation after retry")
        raise HTTPException(status_code=502, detail="Program normalization failed")
    except Exception:
        outcome = "error"
        raise
    finally:
        metrics.log()
        record_request(metrics, outcome, kind="program_normalize")


@router.post("/programs/suggest")
async def programs_suggest(req: ProgramSuggestRequest) -> StreamingResponse:
    """NDJSON stream: assessment -> suggestion events -> metrics -> end.

    Metrics recording lives inside run_program_suggest (the driver owns
    the request lifecycle, like run_chat does for chat).
    """
    # The instruction is user content — log its presence, never its text.
    logger.info(
        "programs/suggest user=%s weeks=%d instruction=%s",
        req.user_id,
        len(req.program.weeks),
        req.instruction is not None,
    )
    return StreamingResponse(run_program_suggest(req), media_type="application/x-ndjson")
