"""Post-generation checks.

Deliberately simple for now: cheap invariants that catch broken requests,
logged and recorded in metrics (never blocking the stream the user
already received). This is the seam where real evaluation (grounding /
hallucination scoring, DeepEval) plugs in later.
"""

import logging

from app.runtime.context_builder import RuntimeContext
from app.runtime.planner import ExecutionPlan

logger = logging.getLogger(__name__)


def verify(
    ctx: RuntimeContext,
    plan: ExecutionPlan,
    answer: str,
    tools_used: list[str],
    tool_errors: list[str],
) -> list[str]:
    issues: list[str] = []

    if not answer.strip():
        issues.append("empty_answer")

    if plan.retrieve and (ctx.retrieved is None or not ctx.retrieved.documents):
        issues.append("retrieval_planned_but_no_docs")

    if plan.lifter_data and not tools_used:
        issues.append("lifter_data_planned_but_no_tool_calls")

    # The model called tools but every call failed — the answer is running
    # on no data (e.g. DB unreachable) even though tools_used looks healthy.
    if tools_used and len(tool_errors) >= len(tools_used):
        issues.append("all_tool_calls_failed")

    if issues:
        logger.warning("verifier issues chat=%s: %s", ctx.request.chat_id, issues)
    return issues
