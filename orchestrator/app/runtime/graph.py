"""The runtime graph. Every chat request runs the same flow:

    context → plan ──► retrieve ──► generate → verify ──► summarize ──► finalize
                 └────────────────►────┘             └──────────►────────┘

Each node wraps one stage module (planner, generator, ...) so stages stay
plain functions that can be tested and evaluated in isolation — LangGraph
only does the wiring. User-visible output (tokens, citations, summary,
metrics) is emitted through the custom stream writer and surfaced by
run_chat as NDJSON.
"""

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.models import (
    Citation,
    CitationsEvent,
    ChatMessage,
    MetricsEvent,
    SummaryEvent,
    TokenEvent,
)
from app.runtime.context_builder import build_context
from app.runtime.generator import generate
from app.runtime.planner import plan_request
from app.runtime.state import RuntimeState
from app.runtime.summarizer import summarize
from app.runtime.verifier import verify
from app.tools.opl import OPL_TOOLS
from app.tools.retrieval import DEFAULT_PROGRAM_TOPICS, retrieve_knowledge


async def context_node(state: RuntimeState) -> dict:
    """Subscription-aware history trim, summary policy, refresh cadence."""
    return {"ctx": build_context(state["request"])}


async def plan_node(state: RuntimeState) -> dict:
    """Decide which capabilities this query needs."""
    metrics = state["metrics"]
    with metrics.timer("planner"):
        plan = await plan_request(state["ctx"])
    metrics.plan = plan.model_dump()
    return {"plan": plan}


def route_after_plan(state: RuntimeState) -> str:
    plan = state["plan"]
    return "retrieve" if (plan.retrieve or plan.program_design) else "generate"


async def retrieve_node(state: RuntimeState) -> dict:
    """Knowledge-base retrieval. Program design always pulls the
    programming-theory topics in as well."""
    ctx, plan, metrics = state["ctx"], state["plan"], state["metrics"]
    with metrics.timer("retrieval"):
        ctx.retrieved = await retrieve_knowledge(
            ctx.query,
            extra_topics=DEFAULT_PROGRAM_TOPICS if plan.program_design else None,
        )
    metrics.docs_retrieved = len(ctx.retrieved.documents)
    return {"ctx": ctx}


async def generate_node(state: RuntimeState) -> dict:
    """Agentic tool loop; streams tokens out as they arrive, then source
    citations for whatever retrieval found."""
    writer = get_stream_writer()
    ctx, plan, metrics = state["ctx"], state["plan"], state["metrics"]
    tools = OPL_TOOLS if plan.lifter_data else []

    answer = ""
    with metrics.timer("generation"):
        async for delta in generate(ctx, plan, tools, metrics):
            answer += delta
            writer(TokenEvent(text=delta))

    if ctx.retrieved and ctx.retrieved.documents:
        writer(
            CitationsEvent(
                items=[
                    Citation(
                        id=doc.id,
                        similarity=doc.similarity,
                        hybrid_score=doc.hybrid_score,
                        metadata=doc.metadata,
                    )
                    for doc in ctx.retrieved.documents
                ]
            )
        )
    return {"answer": answer}


async def verify_node(state: RuntimeState) -> dict:
    """Cheap invariants recorded for evaluation — never blocks the stream
    the user already received."""
    metrics = state["metrics"]
    metrics.verifier_issues = verify(
        state["ctx"], state["plan"], state["answer"], metrics.tools_used
    )
    return {}


def route_after_verify(state: RuntimeState) -> str:
    if state["ctx"].should_update_summary and state["answer"].strip():
        return "summarize"
    return "finalize"


async def summarize_node(state: RuntimeState) -> dict:
    """Refresh the rolling summary; the gateway persists it."""
    writer = get_stream_writer()
    ctx, metrics = state["ctx"], state["metrics"]
    with metrics.timer("summary"):
        new_summary = await summarize(
            ctx.summary,
            [
                *ctx.history,
                ChatMessage(role="User", content=ctx.query),
                ChatMessage(role="Assistant", content=state["answer"]),
            ],
        )
    if new_summary:
        writer(SummaryEvent(text=new_summary))
    return {}


async def finalize_node(state: RuntimeState) -> dict:
    """Trailing observability event."""
    get_stream_writer()(MetricsEvent(data=state["metrics"].to_dict()))
    return {}


def build_runtime_graph() -> CompiledStateGraph:
    graph = StateGraph(RuntimeState)

    graph.add_node("context", context_node)
    graph.add_node("plan", plan_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)
    graph.add_node("verify", verify_node)
    graph.add_node("summarize", summarize_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "context")
    graph.add_edge("context", "plan")
    graph.add_conditional_edges("plan", route_after_plan, ["retrieve", "generate"])
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", "verify")
    graph.add_conditional_edges("verify", route_after_verify, ["summarize", "finalize"])
    graph.add_edge("summarize", "finalize")
    graph.add_edge("finalize", END)

    return graph.compile()


# Compiled once at import; stateless across requests.
RUNTIME_GRAPH = build_runtime_graph()
