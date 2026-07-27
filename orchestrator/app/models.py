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


# ---------------------------------------------------------------------------
# Program contract. Mirrors the Program types in web/src/lib/program.ts —
# change both together.
#
# Node ids: every week/day/exercise carries a stable string id ("w1d2e3").
# The LLM never produces ids (default "" = unassigned); the orchestrator
# assigns them after validation, and AI suggestions target them. The client
# generates its own ids for manually added nodes.
# ---------------------------------------------------------------------------


class ExercisePrescription(BaseModel):
    id: str = ""
    name: str
    sets: int | None = None
    # "3x8-10" -> sets=3, reps_min=8, reps_max=10; single value -> min == max
    reps_min: int | None = None
    reps_max: int | None = None
    amrap: bool = False
    # "RPE 7-8" -> rpe=7, rpe_max=8; single value -> rpe only
    rpe: float | None = None
    rpe_max: float | None = None
    percentage: float | None = None  # % of 1RM, 0-100
    superset_group: str | None = None  # same label = performed together
    notes: str | None = None
    raw: str | None = None  # original text when parsing was lossy


class ProgramDay(BaseModel):
    id: str = ""
    label: str  # "Day 1" / "Monday" — normalizer invents "Day N" if unnamed
    exercises: list[ExercisePrescription] = []
    notes: str | None = None


class ProgramWeek(BaseModel):
    id: str = ""
    label: str  # "Week 1"
    block: str | None = None  # optional block label, not a structural layer
    days: list[ProgramDay] = []
    notes: str | None = None


class Program(BaseModel):
    title: str | None = None
    weeks: list[ProgramWeek] = []  # gateway enforces the 12-week cap
    notes: str | None = None
    warnings: list[str] = []  # normalizer's "couldn't structure X" notes


SuggestionKind = Literal[
    "modify_exercise",
    "add_exercise",
    "remove_exercise",
    "add_day",
    "remove_day",
    "program_note",
]


class Suggestion(BaseModel):
    """One discrete, individually acceptable edit. The closed `kind`
    vocabulary is the AI's entire editing power: anything it cannot express
    here, it cannot suggest — which is what makes suggestions validatable
    against the program before they reach the client."""

    id: str  # assigned by the orchestrator, not the LLM
    kind: SuggestionKind
    # modify/remove_exercise -> exercise id; add_exercise/remove_day -> day
    # id; add_day -> week id; program_note -> None.
    target_id: str | None = None
    # modify_exercise: partial ExercisePrescription fields;
    # add_exercise: full exercise; add_day: full day. None for removals/notes.
    payload: dict | None = None
    rationale: str

class ProgramNormalizeRequest(BaseModel):
    user_id: str
    # The raw paste. Cap mirrors the gateway's zod max — both boundaries agree.
    program_text: str = Field(min_length=1, max_length=20_000)
    request_context: RequestContext = RequestContext()


class ProgramNormalizeResponse(BaseModel):
    """Plain JSON response (not NDJSON) — a single structured document
    gains nothing from streaming."""

    is_program: bool
    reason: str | None = None  # human-readable, only when is_program=False
    program: Program | None = None  # ids assigned, only when is_program=True


class ProgramSuggestRequest(BaseModel):
    user_id: str
    program: Program
    # The user's targeted ask ("make day 2 easier"); None = general insights.
    instruction: str | None = Field(default=None, max_length=500)
    request_context: RequestContext = RequestContext()


class AssessmentEvent(BaseModel):
    """Suggest stream: the 2-3 sentence overall read, before suggestions."""

    type: Literal["assessment"] = "assessment"
    text: str


class SuggestionEvent(BaseModel):
    """Suggest stream: one validated suggestion, emitted as soon as its
    JSONL line completes — cards appear one by one in the UI."""

    type: Literal["suggestion"] = "suggestion"
    suggestion: Suggestion


# ---------------------------------------------------------------------------
# The full event vocabulary. Defined last so every event type is in scope;
# the gateway ignores types it doesn't know, so chat and program streams
# can share one union without breaking each other.
# ---------------------------------------------------------------------------

StreamEvent = Annotated[
    Union[
        TokenEvent,
        CitationsEvent,
        SummaryEvent,
        MetricsEvent,
        EndEvent,
        ErrorEvent,
        AssessmentEvent,
        SuggestionEvent,
    ],
    Field(discriminator="type"),
]


def ndjson(event: BaseModel) -> str:
    """Serialize one event as an NDJSON line."""
    return event.model_dump_json() + "\n"
