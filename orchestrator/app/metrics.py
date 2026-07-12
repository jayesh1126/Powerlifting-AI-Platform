"""Per-request observability.

Every chat request produces one RequestMetrics: stage latencies, token
usage, which tools ran, what the planner decided, and any verifier
issues. It is logged and emitted as a trailing `metrics` stream event —
never shown to users. This is the seed of the evaluation pipeline.
"""

import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Iterator

logger = logging.getLogger(__name__)


@dataclass
class RequestMetrics:
    user_id: str
    chat_id: str

    latencies_ms: dict[str, float] = field(default_factory=dict)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    tools_used: list[str] = field(default_factory=list)
    docs_retrieved: int = 0
    plan: dict = field(default_factory=dict)
    generator_model: str | None = None
    verifier_issues: list[str] = field(default_factory=list)

    @contextmanager
    def timer(self, stage: str) -> Iterator[None]:
        start = time.perf_counter()
        try:
            yield
        finally:
            self.latencies_ms[stage] = round((time.perf_counter() - start) * 1000, 1)

    def add_usage(self, prompt_tokens: int | None, completion_tokens: int | None) -> None:
        self.prompt_tokens += prompt_tokens or 0
        self.completion_tokens += completion_tokens or 0

    def to_dict(self) -> dict:
        return {
            "latencies_ms": self.latencies_ms,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "tools_used": self.tools_used,
            "docs_retrieved": self.docs_retrieved,
            "plan": self.plan,
            "generator_model": self.generator_model,
            "verifier_issues": self.verifier_issues,
        }

    def log(self) -> None:
        logger.info(
            "request metrics user=%s chat=%s %s",
            self.user_id,
            self.chat_id,
            self.to_dict(),
        )
