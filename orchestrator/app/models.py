"""Request/response contract with the Next.js gateway.

Mirrors web/src/lib/orchestrator.ts — change both together.

Design notes:
- No `mode` field. The gateway does not route AI behaviour; the planner
  inside the runtime decides which capabilities a query needs.
- The gateway sends a generous window of recent messages plus the total
  count; the runtime's context builder decides how much of it to use
  (subscription-aware). Context policy is an AI concern, so it lives here.
- The response is a newline-delimited JSON (NDJSON) event stream, not raw
  text: tokens first, then trailing events (citations, updated summary,
  metrics). The gateway forwards token text to the browser and persists
  the rest.
"""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

ChatRole = Literal["User", "Assistant"]
Subscription = Literal["free", "pro"]


class ChatMessage(BaseModel):
    role: ChatRole
    content: str


class UserContext(BaseModel):
    subscription: Subscription = "free"


class RequestContext(BaseModel):
    timezone: str = "UTC"
    locale: str = "en"


class ChatStreamRequest(BaseModel):
    user_id: str
    chat_id: str

    # Recent window, oldest first. The final item is the new user message.
    messages: list[ChatMessage] = Field(min_length=1)

    # Rolling conversation summary the gateway has persisted (already
    # decrypted). None for young chats.
    summary: str | None = None

    # Messages persisted in the DB before this turn — tells the runtime how
    # long the conversation really is without shipping all of it.
    total_message_count: int = 0

    user_context: UserContext = UserContext()
    request_context: RequestContext = RequestContext()

    @property
    def query(self) -> str:
        """The new user message this turn must answer."""
        return self.messages[-1].content


# ---------------------------------------------------------------------------
# Stream events (NDJSON lines). The gateway ignores types it doesn't know,
# so new event types can be added without breaking it.
# ---------------------------------------------------------------------------


class TokenEvent(BaseModel):
    type: Literal["token"] = "token"
    text: str


class Citation(BaseModel):
    id: int | str
    similarity: float | None = None
    hybrid_score: float | None = None
    metadata: dict = {}


class CitationsEvent(BaseModel):
    type: Literal["citations"] = "citations"
    items: list[Citation]


class SummaryEvent(BaseModel):
    """Emitted only on turns where the runtime refreshed the rolling
    summary. The gateway encrypts and persists it."""

    type: Literal["summary"] = "summary"
    text: str


class MetricsEvent(BaseModel):
    """Per-request observability. Not shown to users — the gateway just
    logs it (later: shipped to a metrics store)."""

    type: Literal["metrics"] = "metrics"
    data: dict


class EndEvent(BaseModel):
    type: Literal["end"] = "end"


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


StreamEvent = Annotated[
    Union[TokenEvent, CitationsEvent, SummaryEvent, MetricsEvent, EndEvent, ErrorEvent],
    Field(discriminator="type"),
]


def ndjson(event: BaseModel) -> str:
    """Serialize one event as an NDJSON line."""
    return event.model_dump_json() + "\n"
