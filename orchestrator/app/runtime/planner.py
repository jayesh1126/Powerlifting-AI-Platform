"""The planner decides WHICH capabilities a request needs — nothing else.

It replaces the old deterministic router (general/program/analytics).
Capabilities are not mutually exclusive: "compare my squat progression to
Russel Orhii and fix my program" legitimately needs lifter data AND
knowledge retrieval AND program design.

The planner never answers, and it never picks tool *arguments* — the
generator's native tool-calling loop does that, because only the model
mid-reasoning knows e.g. which lifter name to look up.

A cheap LLM with JSON output does the classification; a keyword heuristic
takes over when no LLM is configured or the call fails.
"""

import logging
import re

from pydantic import BaseModel

from app.config import get_settings
from app.llm import get_chat_client
from app.runtime.context_builder import RuntimeContext

logger = logging.getLogger(__name__)


class ExecutionPlan(BaseModel):
    # Run knowledge-base retrieval before generating.
    retrieve: bool = True
    # Bind the OpenPowerlifting SQL tools to the generator.
    lifter_data: bool = False
    # Inject program-design rules + templates into the system prompt.
    program_design: bool = False
    reasoning: str = ""
    planner: str = "llm"  # "llm" | "heuristic" — recorded for evaluation


PLANNER_SYSTEM_PROMPT = """You are a request planner for a powerlifting AI coach.
Given the user's message (and conversation summary if present), decide which
capabilities are needed to answer it. Output JSON ONLY:

{"retrieve": bool, "lifter_data": bool, "program_design": bool, "reasoning": "one short sentence"}

Capabilities:
- "retrieve": search the curated training knowledge base. Needed for questions
  about technique, programming concepts, injuries, recovery, rules, meet prep.
  Almost always true, EXCEPT for pure competition-data lookups.
- "lifter_data": query the OpenPowerlifting competition results database.
  Needed when the user mentions specific lifters by name, records, rankings,
  leaderboards, "top N", meet results, or comparisons against real athletes.
- "program_design": generate or modify a full training program. Needed when the
  user asks for a program/plan/routine over weeks, or changes to one.

Multiple capabilities can be true at once. Reply with JSON only."""

_LIFTER_DATA_PATTERN = re.compile(
    r"\b(record|top \d+|top ten|leaderboard|rank|best (male|female|lifter)|ipf|"
    r"openpowerlifting|total|dots|wilks|goodlift|meet result|competition result|compare)\b",
    re.IGNORECASE,
)
_PROGRAM_PATTERN = re.compile(
    r"\b(program|routine|plan|weeks?|block|peaking|meso ?cycle|template)\b",
    re.IGNORECASE,
)


def heuristic_plan(query: str) -> ExecutionPlan:
    """Deterministic fallback — coarse, but keeps the runtime functional
    with no LLM configured."""
    lifter_data = bool(_LIFTER_DATA_PATTERN.search(query))
    program_design = bool(_PROGRAM_PATTERN.search(query))
    return ExecutionPlan(
        retrieve=not lifter_data or program_design,
        lifter_data=lifter_data,
        program_design=program_design,
        reasoning="keyword heuristic",
        planner="heuristic",
    )


async def plan_request(ctx: RuntimeContext) -> ExecutionPlan:
    client = get_chat_client()
    if client is None:
        return heuristic_plan(ctx.query)

    settings = get_settings()
    user_content = ctx.query
    if ctx.summary:
        user_content = f"Conversation summary:\n{ctx.summary}\n\nUser message:\n{ctx.query}"

    try:
        response = await client.chat.completions.create(
            model=settings.planner_model,
            temperature=0,
            max_tokens=200,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
        plan = ExecutionPlan.model_validate_json(response.choices[0].message.content or "{}")
        plan.planner = "llm"
        # Reasoning paraphrases the user's query — DEBUG only; the metrics
        # event carries the full plan for observability.
        logger.debug("plan: %s", plan.model_dump())
        logger.info(
            "plan: retrieve=%s lifter_data=%s program_design=%s",
            plan.retrieve, plan.lifter_data, plan.program_design,
        )
        return plan
    except Exception:
        logger.exception("LLM planner failed — falling back to heuristic")
        return heuristic_plan(ctx.query)
