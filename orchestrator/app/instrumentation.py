"""Prometheus instruments for the orchestrator.

Aggregate view over RequestMetrics: runtime.py calls record_request()
once per finished request, and /metrics (mounted in main.py) renders
the registry on each Prometheus scrape. Nothing is pushed anywhere.

Label rule: bounded values only (stage, tool, model, outcome) — never
user_id / chat_id / request_id, each unique value is a new time series.

Assumes a single uvicorn worker process (as in the Dockerfile). With
--workers N each process would have its own registry and this needs
prometheus_client's multiprocess mode instead.
"""

from collections import Counter as Multiset

from prometheus_client import Counter, Histogram

from app.metrics import RequestMetrics

# LLM-shaped buckets: the generator stage routinely runs 10-60s, so the
# default buckets (max 10s) would lump everything interesting into +Inf.
STAGE_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60, 120)

CHAT_REQUESTS = Counter(
    "chat_requests_total",
    "Chat requests handled by the runtime.",
    ["outcome"],  # ok | error
)
# Pre-create both series so rate() queries see 0 instead of "no data"
# before the first error ever happens.
for outcome in ("ok", "error"):
    CHAT_REQUESTS.labels(outcome)

STAGE_DURATION = Histogram(
    "chat_stage_duration_seconds",
    "Wall-clock duration of each runtime stage.",
    ["stage"],
    buckets=STAGE_BUCKETS,
)

LLM_TOKENS = Counter(
    "llm_tokens_total",
    "LLM tokens consumed, by kind and model.",
    ["kind", "model"],   # kind = prompt | completion
)

TOOL_CALLS = Counter(
    "tool_calls_total",
    "Tool calls done, by tool and status.",
    ["tool", "status"] # status = ok | error
)

VERIFIER_ISSUES = Counter(
    "verifier_issues_total",
    "Amount of failed verifier checks",
    ["issue"]
)

DOCS_BUCKETS = (0, 1, 2, 5, 10, 20)

DOCS_RETRIEVED = Histogram(
    "docs_retrieved",
    "Number of documents retrieved per request.",
    buckets=DOCS_BUCKETS
)

PROGRAM_REQUESTS = Counter(
    "program_requests_total",
    "Program AI operations handled by the runtime.",
    ["op", "outcome"],  # op = normalize | suggest
)
# Outcome sets differ per op: only normalize can reject ("that's a recipe");
# suggest either works or errors. Pre-created like CHAT_REQUESTS above.
for _op, _outcomes in (("normalize", ("ok", "rejected", "error")), ("suggest", ("ok", "error"))):
    for _outcome in _outcomes:
        PROGRAM_REQUESTS.labels(_op, _outcome)

PROGRAM_SUGGESTIONS = Counter(
    "program_suggestions_total",
    "Suggestions from the suggest pipeline, by validation status.",
    # dropped/(emitted+dropped) is the LLM-quality signal: a rising drop
    # rate means hallucinated target ids or malformed JSONL.
    ["status"],  # emitted | dropped
)
for _status in ("emitted", "dropped"):
    PROGRAM_SUGGESTIONS.labels(_status)


def record_request(metrics: RequestMetrics, outcome: str, kind: str = "chat") -> None:
    if kind == "chat":
        CHAT_REQUESTS.labels(outcome).inc()
    else:  # "program_normalize" | "program_suggest"
        PROGRAM_REQUESTS.labels(kind.removeprefix("program_"), outcome).inc()
    for stage, ms in metrics.latencies_ms.items():
        STAGE_DURATION.labels(stage).observe(ms / 1000)
    
    model = metrics.generator_model or "none"
    if metrics.prompt_tokens:
        LLM_TOKENS.labels("prompt", model).inc(metrics.prompt_tokens)
    if metrics.completion_tokens:
        LLM_TOKENS.labels("completion", model).inc(metrics.completion_tokens)

    used = Multiset(metrics.tools_used)
    errors = Multiset(metrics.tool_errors)

    for tool, total in used.items():
        error_count = errors.get(tool, 0)
        ok_count = total - error_count

        if ok_count:
            TOOL_CALLS.labels(tool, "ok").inc(ok_count)

        if error_count:
            TOOL_CALLS.labels(tool, "error").inc(error_count)
    
    for issue in metrics.verifier_issues:
        VERIFIER_ISSUES.labels(issue).inc()

    DOCS_RETRIEVED.observe(metrics.docs_retrieved)


def record_suggestions(emitted: int, dropped: int) -> None:
    if emitted:
        PROGRAM_SUGGESTIONS.labels("emitted").inc(emitted)
    if dropped:
        PROGRAM_SUGGESTIONS.labels("dropped").inc(dropped)

