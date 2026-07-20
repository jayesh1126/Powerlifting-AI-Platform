"""Assembles what the runtime knows before any AI runs.

Context management is an AI concern, so the policy lives here, not in the
gateway. The gateway ships a generous message window + the total count;
this module decides how much of it each subscription tier actually uses.
One dict to tune quality vs. cost — never touch the frontend for it.

This module knows nothing about prompts. It only gathers information.
"""

from dataclasses import dataclass, field

from app.models import ChatMessage, ChatStreamRequest, Subscription
from app.tools.retrieval import RetrievedContext


@dataclass(frozen=True)
class ContextPolicy:
    recent_messages: int
    use_summary: bool


CONTEXT_POLICY: dict[Subscription, ContextPolicy] = {
    "free": ContextPolicy(recent_messages=6, use_summary=True),
    "pro": ContextPolicy(recent_messages=20, use_summary=True),
}

# Refresh the rolling summary on the first exchange, then every 5 exchanges
SUMMARY_REFRESH_EVERY = 10


@dataclass
class RuntimeContext:
    request: ChatStreamRequest
    policy: ContextPolicy

    query: str
    history: list[ChatMessage]  # trimmed, excludes the new user message
    summary: str | None
    should_update_summary: bool

    # Filled in by later runtime stages.
    retrieved: RetrievedContext | None = None
    program_templates: str | None = None
    extra: dict = field(default_factory=dict)


def build_context(request: ChatStreamRequest) -> RuntimeContext:
    policy = CONTEXT_POLICY[request.user_context.subscription]

    history = request.messages[:-1]
    if policy.recent_messages:
        history = history[-policy.recent_messages :]

    # Count as it will be after this turn persists (user + assistant).
    count_after_turn = request.total_message_count + 2
    should_update_summary = (
        count_after_turn == 2 or count_after_turn % SUMMARY_REFRESH_EVERY == 0
    )

    return RuntimeContext(
        request=request,
        policy=policy,
        query=request.query,
        history=history,
        summary=request.summary if policy.use_summary else None,
        should_update_summary=should_update_summary,
    )
