"""Program operations: normalization and suggestion pipelines.

Deliberately plain sequential functions, not a LangGraph graph — these
flows are straight lines with one early exit, and the chat graph earns
LangGraph through conditional routing that doesn't exist here.
"""

import json
import logging
from collections import Counter
from collections.abc import AsyncIterator
from uuid import uuid4

from openai.types.chat import ChatCompletionMessageParam
from pydantic import BaseModel, ConfigDict, ValidationError

from app.config import get_settings
from app.instrumentation import record_request, record_suggestions
from app.llm import get_chat_client
from app.metrics import RequestMetrics
from app.models import (
    AssessmentEvent,
    EndEvent,
    ErrorEvent,
    ExercisePrescription,
    MetricsEvent,
    Program,
    ProgramDay,
    ProgramNormalizeResponse,
    ProgramSuggestRequest,
    Suggestion,
    SuggestionEvent,
    SuggestionKind,
    ndjson,
)
from app.runtime.templates import load_program_templates
from app.tools.retrieval import DEFAULT_PROGRAM_TOPICS, RetrievedContext, retrieve_knowledge

logger = logging.getLogger(__name__)

def assign_node_ids(program: Program) -> Program:
    """Stamp stable ids ("w1", "w1d2", "w1d2e3") onto every node, in place.

    Runs once, immediately after the normalizer's output validates. Ids are
    positional at birth but *stable* afterwards: the client never renumbers,
    so suggestions targeting "w1d2e3" stay valid however the program is
    later edited around it.
    """
    for wi, week in enumerate(program.weeks, start=1):
        week.id = f"w{wi}"
        for di, day in enumerate(week.days, start=1):
            day.id = f"w{wi}d{di}"
            for ei, exercise in enumerate(day.exercises, start=1):
                exercise.id = f"w{wi}d{di}e{ei}"
    return program

class NormalizationError(Exception):
    """The LLM could not produce schema-valid output after a repair retry."""


class NormalizationTruncatedError(NormalizationError):
    """Output hit the token ceiling. Retrying re-runs an impossible task —
    fail immediately with a distinct error so the gateway can say 'too
    large' instead of timing out."""


NORMALIZE_SYSTEM_PROMPT = """You convert a pasted strength-training program into JSON.

Output a single JSON object, nothing else:

{
  "is_program": bool,      // false if the text is not a training program
  "reason": string|null,   // only when is_program is false: one short sentence why
  "program": {             // only when is_program is true
    "title": string|null,
    "notes": string|null,
    "warnings": [string],  // anything you could not structure, one note each
    "weeks": [{
      "label": string,     // "Week 1" — invent sequential labels if unnamed
      "block": string|null,
      "notes": string|null,
      "days": [{
        "label": string,   // "Day 1" / "Monday" — invent "Day N" if unnamed
        "notes": string|null,
        "exercises": [{
          "name": string,
          "sets": int|null,
          "reps_min": int|null,   // "3x8-10" -> sets 3, reps_min 8, reps_max 10
          "reps_max": int|null,   // single rep value -> min == max
          "amrap": bool,          // "AMRAP" -> true, reps null
          "rpe": number|null,     // "RPE 7-8" -> rpe 7, rpe_max 8
          "rpe_max": number|null,
          "percentage": number|null,  // % of 1RM, 0-100
          "superset_group": string|null,  // same letter = performed together
          "notes": string|null,
          "raw": string|null      // the original line, when parsing was lossy
        }]
      }]
    }]
  }
}

Rules:
- Never invent training content that is not in the text.
- OMIT every field whose value would be null, "amrap" when false, and
  "warnings" when empty — omitted fields are filled with defaults
  automatically. Never pad the output with null fields; keep it compact.
- Include "raw" ONLY when a line resisted structuring (lossy parse) — and
  add a warning for it. Cleanly parsed lines get no "raw".
- Do NOT output "id" fields anywhere — they are assigned elsewhere.
- If the program repeats ("weeks 1-4 the same"), expand into explicit weeks.
- is_program is false only when the text is genuinely not a training program
  (a recipe, an essay); a sloppy or partial program is still a program."""


def _stub_normalization() -> ProgramNormalizeResponse:
    """No-LLM dev mode: a canned program so the end-to-end flow works,
    mirroring the chat runtime's stub generator."""
    program = Program.model_validate(
        {
            "title": "Stub Program (no LLM key configured)",
            "weeks": [
                {
                    "label": "Week 1",
                    "days": [
                        {
                            "label": "Day 1",
                            "exercises": [
                                {"name": "Squat", "sets": 3, "reps_min": 5, "reps_max": 5, "rpe": 7},
                                {"name": "Bench Press", "sets": 3, "reps_min": 8, "reps_max": 8, "rpe": 7},
                            ],
                        }
                    ],
                }
            ],
            "warnings": ["Stub output: no LLM key configured."],
        }
    )
    return ProgramNormalizeResponse(is_program=True, program=assign_node_ids(program))


async def normalize_program(
    program_text: str, metrics: RequestMetrics | None = None
) -> ProgramNormalizeResponse:
    """Paste -> validated Program with node ids, or a rejection.

    Degrade path is a validation-retry, not a heuristic fallback: nothing
    deterministic can parse a program, so the one recovery that works is
    showing the model pydantic's exact error and letting it repair its own
    JSON. One retry only — a temp-0 model that fails the same schema twice
    will fail a third time.
    """
    client = get_chat_client()
    if client is None:
        return _stub_normalization()

    settings = get_settings()
    if metrics is not None:
        metrics.generator_model = settings.program_model
    messages = [
        {"role": "system", "content": NORMALIZE_SYSTEM_PROMPT},
        {"role": "user", "content": program_text},
    ]

    for attempt in (1, 2):
        response = await client.chat.completions.create(
            model=settings.program_model,
            temperature=0,
            max_tokens=settings.program_max_tokens,
            response_format={"type": "json_object"},
            messages=messages,
        )
        content = response.choices[0].message.content or "{}"
        if metrics is not None and response.usage:
            metrics.add_usage(response.usage.prompt_tokens, response.usage.completion_tokens)
        if response.choices[0].finish_reason == "length":
            logger.info("normalize output truncated at token ceiling, attempt %d", attempt)
            raise NormalizationTruncatedError("normalizer output exceeded max tokens")
        try:
            result = ProgramNormalizeResponse.model_validate_json(content)
            if result.is_program and result.program is None:
                raise ValueError("is_program is true but program is missing")
        except (ValidationError, ValueError) as exc:
            logger.info("normalize attempt %d failed validation", attempt)
            logger.debug("normalize validation error: %s", exc)
            # Feed the model its own output plus the precise error, so the
            # retry is a repair, not a re-roll.
            messages.append({"role": "assistant", "content": content})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Your JSON failed validation with this error:\n"
                        f"{exc}\n\nReturn the corrected JSON object only."
                    ),
                }
            )
            continue

        if result.program is not None:
            assign_node_ids(result.program)
            logger.info(
                "normalized program: weeks=%d warnings=%d attempt=%d",
                len(result.program.weeks), len(result.program.warnings), attempt,
            )
        else:
            logger.info("normalize rejected input as non-program")
        return result

    raise NormalizationError("normalizer output failed validation after retry")

# ---------------------------------------------------------------------------
# Suggest: prompt assembly
# ---------------------------------------------------------------------------

SUGGEST_SYSTEM_PROMPT = """You are a powerlifting coach reviewing a lifter's OWN training program.

REVIEW POSTURE (overrides anything below):
- The program belongs to the user. Nothing about it is "invalid" — the
  programming principles attached below inform your suggestions; they are
  not validation rules and you never demand compliance with them.
- Respect the user's evident structure and preferences. Propose the
  smallest changes with the largest impact — do not redesign their program
  into your house style.
- Retrieved knowledge excerpts may be attached. Use them only when
  relevant; ignore them otherwise.
- Never describe the principles as "mandatory" or "required", and never
  call the program non-compliant or invalid — they are guidance you weigh,
  not rules the user must satisfy.

OUTPUT FORMAT — JSONL, strictly:
- One JSON object per line. No markdown fences, no prose outside JSON.
- First line: {"kind": "assessment", "text": "<2-3 sentence overall read of the program>"}
- Then at most 10 suggestion lines, most impactful first:
  {"kind": "<suggestion kind>", "target_id": <string or null>, "payload": <object or null>, "rationale": "<one or two sentences>"}

Suggestion kinds (your ENTIRE editing vocabulary):
- "modify_exercise": target_id = an exercise id. payload = ONLY the fields to
  change (e.g. {"sets": 2, "rpe": 7.0}). Fields: name, sets, reps_min,
  reps_max, amrap, rpe, rpe_max, percentage, superset_group, notes.
- "add_exercise":    target_id = the day id to add it to. payload = a full
  exercise object (same fields; name required).
- "remove_exercise": target_id = the exercise id. payload = null.
- "add_day":         target_id = the week id to add it to. payload = a full
  day object: {"label": ..., "exercises": [...], "notes": ...}.
- "remove_day":      target_id = the day id. payload = null.
- "program_note":    target_id = null. payload = null. Advice that is not
  expressible as a concrete edit; put it in "rationale".

Rules:
- target_id MUST be an id that appears in the program JSON you were given.
  Never invent ids. Never emit an "id" field in payloads.
- Every suggestion needs a rationale a lifter can evaluate.
- If a user instruction is present, ALL suggestions must serve that
  instruction — do not append unrelated general feedback.

PROGRAMMING PRINCIPLES (guidance, not law):
{templates}"""


def derive_retrieval_query(program: Program, instruction: str | None) -> str:
    """A retrieval query from the program's shape, not the raw paste.

    The instruction (when present) leads, so retrieved excerpts match the
    ask; the structural summary grounds it in what the program actually is.
    """
    weeks = len(program.weeks)
    days = max((len(w.days) for w in program.weeks), default=0)
    names: list[str] = []
    for week in program.weeks:
        for day in week.days:
            for exercise in day.exercises:
                lowered = exercise.name.lower()
                if lowered not in names:
                    names.append(lowered)
    summary = (
        f"powerlifting program review: {weeks} weeks, {days} days per week, "
        f"exercises: {', '.join(names[:12])}"
    )
    return f"{instruction} — {summary}" if instruction else summary


def build_suggest_messages(
    program: Program,
    instruction: str | None,
    retrieved: RetrievedContext | None,
) -> list[ChatCompletionMessageParam]:
    system = SUGGEST_SYSTEM_PROMPT.replace("{templates}", load_program_templates())

    excerpts = "Retrieved training excerpts: (none found)"
    if retrieved and retrieved.documents:
        blocks = [
            f"Excerpt {i + 1}\n{doc.content[:1400]}"
            for i, doc in enumerate(retrieved.documents)
        ]
        excerpts = "Retrieved training excerpts:\n\n" + "\n\n---\n\n".join(blocks)

    user = f"My program:\n{program.model_dump_json(indent=1)}"
    if instruction:
        user += f"\n\nMy instruction: {instruction}"

    return [
        {"role": "system", "content": system},
        {"role": "system", "content": excerpts},
        {"role": "user", "content": user},
    ]


# ---------------------------------------------------------------------------
# Suggest: parse tolerantly, validate strictly, drop loudly
# ---------------------------------------------------------------------------

MAX_SUGGESTIONS_PER_CALL = 12


class ExercisePatch(BaseModel):
    """Partial exercise update for modify_exercise payloads.

    extra="forbid": an unknown field is a validation failure (dropped +
    counted), never silently-kept dict noise. All fields optional; pydantic
    tracks which were explicitly set, so {"rpe": null} ("clear the RPE")
    survives model_dump(exclude_unset=True) while unmentioned fields drop.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    sets: int | None = None
    reps_min: int | None = None
    reps_max: int | None = None
    amrap: bool | None = None
    rpe: float | None = None
    rpe_max: float | None = None
    percentage: float | None = None
    superset_group: str | None = None
    notes: str | None = None


class SuggestionDraft(BaseModel):
    """The LLM-facing line shape — no id; the orchestrator assigns those."""

    kind: SuggestionKind
    target_id: str | None = None
    payload: dict | None = None
    rationale: str


def _new_node_id() -> str:
    # AI-added nodes get server-assigned ids so the client can apply the
    # payload as-is; "n" prefix distinguishes them from positional ids.
    return "n" + uuid4().hex[:8]


def validate_suggestion(
    raw: dict, program: Program, seq: int
) -> tuple[Suggestion | None, str | None]:
    """One raw JSONL line -> (Suggestion, None) or (None, drop_reason).

    Drop reasons are a bounded set — they become metric labels.
    """
    try:
        draft = SuggestionDraft.model_validate(raw)
    except ValidationError:
        return None, "bad_shape"

    exercises = {e.id: e for w in program.weeks for d in w.days for e in d.exercises}
    days = {d.id: d for w in program.weeks for d in w.days}
    weeks = {w.id: w for w in program.weeks}

    payload = dict(draft.payload or {})
    # Observed in testing: the model leaks "id" into add payloads despite
    # the prompt forbidding it. Prompts request; only code enforces.
    payload.pop("id", None)
    target = draft.target_id
    final_payload: dict | None = None

    if draft.kind == "modify_exercise":
        if target not in exercises:
            return None, "bad_target"
        if not payload:
            return None, "bad_payload"
        try:
            patch = ExercisePatch.model_validate(payload)
        except ValidationError:
            return None, "bad_payload"
        final_payload = patch.model_dump(exclude_unset=True)

    elif draft.kind == "add_exercise":
        if target not in days:
            return None, "bad_target"
        try:
            exercise = ExercisePrescription.model_validate(payload)
        except ValidationError:
            return None, "bad_payload"
        exercise.id = _new_node_id()
        final_payload = exercise.model_dump()

    elif draft.kind == "remove_exercise":
        if target not in exercises:
            return None, "bad_target"

    elif draft.kind == "add_day":
        if target not in weeks:
            return None, "bad_target"
        for entry in payload.get("exercises", []):
            if isinstance(entry, dict):
                entry.pop("id", None)
        try:
            day = ProgramDay.model_validate(payload)
        except ValidationError:
            return None, "bad_payload"
        day.id = _new_node_id()
        for exercise in day.exercises:
            exercise.id = _new_node_id()
        final_payload = day.model_dump()

    elif draft.kind == "remove_day":
        if target not in days:
            return None, "bad_target"

    else:  # program_note
        target = None

    return (
        Suggestion(
            id=f"s{seq}",
            kind=draft.kind,
            target_id=target,
            payload=final_payload,
            rationale=draft.rationale,
        ),
        None,
    )


class SuggestFormatError(Exception):
    """The LLM produced no parseable assessment or suggestions at all."""


class SuggestLineParser:
    """Stateful JSONL parser shared by the streaming path and the
    whole-text fallback — one place owns line semantics, so the two paths
    cannot drift. feed() returns a wire event to emit, or None."""

    def __init__(self, program: Program):
        self.program = program
        self.assessment: str | None = None
        self.suggestions: list[Suggestion] = []
        self.dropped: Counter = Counter()

    def feed(self, line: str) -> AssessmentEvent | SuggestionEvent | None:
        line = line.strip()
        if not line or line.startswith("```"):
            return None  # tolerate stray fence lines without failing the call
        try:
            raw = json.loads(line)
        except ValueError:
            self.dropped["bad_json"] += 1
            return None
        return self._feed_obj(raw)

    def feed_array(self, text: str):
        """Fallback when line parsing yielded nothing: maybe the model
        emitted one JSON array instead of JSONL."""
        try:
            raw = json.loads(text.strip().strip("`"))
        except ValueError:
            return
        if not isinstance(raw, list):
            return
        for item in raw:
            if isinstance(item, dict):
                event = self._feed_obj(item)
                if event is not None:
                    yield event

    def _feed_obj(self, raw) -> AssessmentEvent | SuggestionEvent | None:
        if not isinstance(raw, dict):
            self.dropped["bad_json"] += 1
            return None

        if raw.get("kind") == "assessment":
            text = raw.get("text")
            if self.assessment is None and isinstance(text, str):
                self.assessment = text
                return AssessmentEvent(text=text)
            return None

        if len(self.suggestions) >= MAX_SUGGESTIONS_PER_CALL:
            self.dropped["over_cap"] += 1
            return None

        suggestion, reason = validate_suggestion(raw, self.program, seq=len(self.suggestions) + 1)
        if suggestion is None:
            self.dropped[reason] += 1
            logger.info("suggestion dropped: %s", reason)
            return None
        self.suggestions.append(suggestion)
        return SuggestionEvent(suggestion=suggestion)


def parse_suggest_output(
    text: str, program: Program
) -> tuple[str | None, list[Suggestion], Counter]:
    """Whole-text convenience wrapper over SuggestLineParser (tests use it;
    the streaming driver feeds the parser line-by-line instead)."""
    parser = SuggestLineParser(program)
    for line in text.splitlines():
        parser.feed(line)
    return parser.assessment, parser.suggestions, parser.dropped


# ---------------------------------------------------------------------------
# Suggest: the streaming driver (mirrors runtime.py's run_chat shape)
# ---------------------------------------------------------------------------


async def run_program_suggest(req: ProgramSuggestRequest) -> AsyncIterator[str]:
    """Program + optional instruction -> NDJSON stream: assessment, then
    validated suggestions (one event per completed JSONL line), metrics, end.
    """
    metrics = RequestMetrics(user_id=req.user_id, chat_id="program:suggest")
    outcome = "ok"
    parser = SuggestLineParser(req.program)

    try:
        client = get_chat_client()
        if client is None:
            yield ndjson(AssessmentEvent(
                text="[stub — no LLM key configured] The suggest pipeline executed end-to-end."
            ))
            yield ndjson(SuggestionEvent(suggestion=Suggestion(
                id="s1", kind="program_note", target_id=None, payload=None,
                rationale="Stub suggestion: configure an LLM key for real insights.",
            )))
            yield ndjson(EndEvent())
            return

        settings = get_settings()
        metrics.generator_model = settings.program_model

        with metrics.timer("retrieval"):
            retrieved = await retrieve_knowledge(
                derive_retrieval_query(req.program, req.instruction),
                extra_topics=DEFAULT_PROGRAM_TOPICS,
            )
        metrics.docs_retrieved = len(retrieved.documents)

        buffer = ""
        full_text: list[str] = []
        with metrics.timer("suggest_llm"):
            stream = await client.chat.completions.create(
                model=settings.program_model,
                temperature=0.2,
                max_tokens=settings.program_max_tokens,
                stream=True,
                stream_options={"include_usage": True},
                messages=build_suggest_messages(req.program, req.instruction, retrieved),
            )
            async for chunk in stream:
                if chunk.usage:
                    metrics.add_usage(chunk.usage.prompt_tokens, chunk.usage.completion_tokens)
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if not (delta and delta.content):
                    continue
                buffer += delta.content
                full_text.append(delta.content)
                # Emit each suggestion the moment its line completes — this
                # loop is why cards appear one by one instead of all at once.
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    event = parser.feed(line)
                    if event is not None:
                        yield ndjson(event)

        # The final line usually arrives without a trailing newline.
        event = parser.feed(buffer)
        if event is not None:
            yield ndjson(event)

        if parser.assessment is None and not parser.suggestions:
            # Wholesale format failure — maybe it emitted one JSON array.
            for event in parser.feed_array("".join(full_text)):
                yield ndjson(event)
        if parser.assessment is None and not parser.suggestions:
            raise SuggestFormatError("no parseable lines in suggest output")

        yield ndjson(MetricsEvent(data=metrics.to_dict()))
        yield ndjson(EndEvent())
    except Exception:
        outcome = "error"
        # Content-free: the instruction/program never appear at INFO+.
        logger.exception("program suggest failed user=%s", req.user_id)
        yield ndjson(ErrorEvent(message="The AI runtime failed to produce suggestions."))
    finally:
        metrics.log()
        record_request(metrics, outcome, kind="program_suggest")
        record_suggestions(len(parser.suggestions), sum(parser.dropped.values()))
