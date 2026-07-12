"""Shared state flowing through the runtime graph.

Nodes read what they need and return partial updates; LangGraph merges
them. `metrics` is a mutable accumulator shared by every node.
"""

from typing import TypedDict

from app.metrics import RequestMetrics
from app.models import ChatStreamRequest
from app.runtime.context_builder import RuntimeContext
from app.runtime.planner import ExecutionPlan


class RuntimeState(TypedDict, total=False):
    # Set at entry.
    request: ChatStreamRequest
    metrics: RequestMetrics

    # Produced by nodes.
    ctx: RuntimeContext
    plan: ExecutionPlan
    answer: str
