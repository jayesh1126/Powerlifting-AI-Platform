"""Answer generation: a streaming agentic tool loop.

The generator receives assembled context (history, summary, retrieved
docs, plan) and streams the answer. When the planner granted tools, they
are bound via native tool calling and the model decides when/how to call
them — the loop executes calls, feeds results back, and continues until
the model produces a final answer or the round limit is hit (port of the
old toolCallLimitMiddleware).

With no LLM configured this degrades to a stub stream so the end-to-end
flow still works in dev.

Prompts are ports of the old RetrievalHandler / AnalyticsHandler /
ProgramHandler system prompts, merged into one composable prompt.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path

from app.config import get_settings
from app.llm import get_chat_client
from app.metrics import RequestMetrics
from app.runtime.context_builder import RuntimeContext
from app.runtime.planner import ExecutionPlan
from app.tools.base import Tool

logger = logging.getLogger(__name__)

MAX_CHARS_PER_EXCERPT = 1400

_TEMPLATES_PATH = Path(__file__).resolve().parents[2] / "content" / "program_templates.md"
_templates_cache: str | None = None


def load_program_templates() -> str:
    global _templates_cache
    if _templates_cache is None:
        try:
            _templates_cache = _TEMPLATES_PATH.read_text(encoding="utf-8")
        except OSError:
            logger.warning("program templates missing at %s", _TEMPLATES_PATH)
            _templates_cache = "(no templates available)"
    return _templates_cache


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------

BASE_SYSTEM_PROMPT = """You are a professional powerlifting coach.

Task: Answer the user's questions about strength training, programming, technique, injuries, and competition prep.

You may receive retrieved training excerpts.
- Use the retrieved excerpts ONLY if they are relevant to the user's question.
- If the retrieved excerpts are irrelevant or not helpful, ignore them and answer using general strength training knowledge.
- Do not invent details that are not supported by the excerpts or the conversation.

Style:
- Be concise and practical.
- If there are multiple valid approaches, briefly mention them.
- Include safety considerations when relevant (pain/injury red flags)."""

ANALYTICS_PROMPT_SECTION = """
COMPETITION DATA TOOLS:
You have tools that query the official OpenPowerlifting dataset. Use kilograms (kg), not pounds.
- For any claim about a real lifter's numbers, records, rankings, or meet results you MUST use the tools — never outside knowledge, never fabricate results.
- get_lifter_history: call when the user mentions a person by name — including "who is X" questions (max 2 lifters per question). NEVER claim a person is or is not in the dataset without calling this first. Attempts: positive = successful, negative = failed, null = not recorded. Compute PRs, totals, success rates, progression from the returned rows only.
- leaderboard_query: call for "top", "best", "ranked", "leaderboard" questions. Only pass filters the user explicitly asked for — never invent sex/country/class filters.
- If a name matches several different lifters, ask the user to clarify instead of guessing.
- If the dataset lacks the information, say so plainly."""

PROGRAM_PROMPT_SECTION = """
PROGRAM DESIGN:
The user wants a training program created or modified.
- Follow evidence-based strength training principles and the user's personal requirements from the conversation.
- Use the design rules and example templates below as guidance.
- Produce a complete, well-structured program in Markdown tables: weeks, days, sets, reps, RPEs, notes.
- When modifying an existing program, change only what the user asked for.

PROGRAM DESIGN RULES & EXAMPLE TEMPLATES:
{templates}"""


def build_system_prompt(ctx: RuntimeContext, plan: ExecutionPlan) -> str:
    prompt = BASE_SYSTEM_PROMPT
    if plan.lifter_data:
        prompt += "\n" + ANALYTICS_PROMPT_SECTION
    if plan.program_design:
        prompt += "\n" + PROGRAM_PROMPT_SECTION.format(templates=load_program_templates())
    if ctx.summary:
        prompt += (
            "\n\nConversation summary (preferences/constraints may be here):\n"
            + ctx.summary
        )
    return prompt


def build_retrieved_context_message(ctx: RuntimeContext) -> str:
    docs = ctx.retrieved.documents if ctx.retrieved else []
    if not docs:
        return "Retrieved training excerpts: (none found)"
    blocks = [
        f"Excerpt {i + 1}\n{doc.content[:MAX_CHARS_PER_EXCERPT]}"
        for i, doc in enumerate(docs)
    ]
    return "Retrieved training excerpts:\n\n" + "\n\n---\n\n".join(blocks)


def build_messages(ctx: RuntimeContext, plan: ExecutionPlan) -> list[dict]:
    role_map = {"User": "user", "Assistant": "assistant"}
    return [
        {"role": "system", "content": build_system_prompt(ctx, plan)},
        {"role": "system", "content": build_retrieved_context_message(ctx)},
        *[{"role": role_map[m.role], "content": m.content} for m in ctx.history],
        {"role": "user", "content": ctx.query},  # ALWAYS last
    ]


# ---------------------------------------------------------------------------
# The agent loop
# ---------------------------------------------------------------------------


async def generate(
    ctx: RuntimeContext,
    plan: ExecutionPlan,
    tools: list[Tool],
    metrics: RequestMetrics,
) -> AsyncIterator[str]:
    """Streams answer text deltas. Tool rounds happen silently between
    text; metrics records every tool call and token usage."""
    client = get_chat_client()
    settings = get_settings()
    metrics.generator_model = settings.generator_model

    if client is None:
        async for delta in _stub_stream(ctx, plan):
            yield delta
        return

    messages = build_messages(ctx, plan)
    tool_schemas = [t.openai_schema() for t in tools]
    tools_by_name = {t.name: t for t in tools}

    for round_index in range(settings.max_tool_rounds + 1):
        # Last round: withhold tools to force a final text answer.
        allow_tools = bool(tool_schemas) and round_index < settings.max_tool_rounds

        # The planner granted these tools because the query NEEDS their data,
        # so the first round must use one — small models otherwise skip the
        # lookup and claim "not in the dataset". Later rounds are auto so the
        # model can stop once it has enough.
        tool_kwargs = {}
        if allow_tools:
            tool_kwargs = {
                "tools": tool_schemas,
                "tool_choice": "required" if round_index == 0 else "auto",
            }

        stream = await client.chat.completions.create(
            model=settings.generator_model,
            temperature=0.4,
            max_tokens=4000,
            stream=True,
            stream_options={"include_usage": True},
            messages=messages,
            **tool_kwargs,
        )

        # Accumulate tool-call deltas by index; stream text out immediately.
        pending_calls: dict[int, dict] = {}
        finish_reason: str | None = None
        answer_this_round = ""

        async for chunk in stream:
            if chunk.usage:
                metrics.add_usage(chunk.usage.prompt_tokens, chunk.usage.completion_tokens)
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            delta = choice.delta
            if delta and delta.content:
                answer_this_round += delta.content
                yield delta.content
            for tc in (delta.tool_calls or []) if delta else []:
                acc = pending_calls.setdefault(
                    tc.index, {"id": "", "name": "", "arguments": ""}
                )
                if tc.id:
                    acc["id"] = tc.id
                if tc.function and tc.function.name:
                    acc["name"] = tc.function.name
                if tc.function and tc.function.arguments:
                    acc["arguments"] += tc.function.arguments
            if choice.finish_reason:
                finish_reason = choice.finish_reason

        if finish_reason != "tool_calls" or not pending_calls:
            return  # final answer finished streaming

        # Execute the requested tools and loop.
        calls = [pending_calls[i] for i in sorted(pending_calls)]
        messages.append(
            {
                "role": "assistant",
                "content": answer_this_round or None,
                "tool_calls": [
                    {
                        "id": c["id"],
                        "type": "function",
                        "function": {"name": c["name"], "arguments": c["arguments"]},
                    }
                    for c in calls
                ],
            }
        )
        for call in calls:
            tool = tools_by_name.get(call["name"])
            logger.info("tool round %d: %s", round_index, call["name"])
            # Arguments derive from user content — DEBUG only.
            logger.debug("tool args: %s", call["arguments"][:200])
            metrics.tools_used.append(call["name"])
            result = (
                await tool.run(call["arguments"])
                if tool
                else json.dumps({"error": f"Unknown tool {call['name']}"})
            )
            # Our tools always return JSON; an object with "error" means the
            # call failed (bad args, DB unreachable, ...). Recording it makes
            # silent degradation visible in metrics and to the verifier.
            try:
                payload = json.loads(result)
                if isinstance(payload, dict) and "error" in payload:
                    metrics.tool_errors.append(call["name"])
                    logger.warning("tool %s returned an error result", call["name"])
            except ValueError:
                pass
            messages.append(
                {"role": "tool", "tool_call_id": call["id"], "content": result}
            )


async def _stub_stream(ctx: RuntimeContext, plan: ExecutionPlan) -> AsyncIterator[str]:
    """No LLM configured: echo the plan so the full pipeline is visible."""
    text = (
        "**[stub — no LLM key configured]** The runtime executed end-to-end. "
        f"Plan: retrieve={plan.retrieve}, lifter_data={plan.lifter_data}, "
        f"program_design={plan.program_design} ({plan.planner}). "
        f"Retrieved docs: {len(ctx.retrieved.documents) if ctx.retrieved else 0}. "
        f'Your question was: "{ctx.query}"'
    )
    for token in text.split(" "):
        yield token + " "
        await asyncio.sleep(0.02)
