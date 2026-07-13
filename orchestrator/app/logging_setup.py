"""Logging configuration for the orchestrator.

Two production concerns:

- **Correlation** — the gateway sends an `X-Request-Id` per chat request;
  a contextvar + logging filter stamps it onto every log line produced
  while serving that request, so concurrent chats are separable and a
  gateway log line can be matched to its orchestrator lines.
- **Format** — human-readable text in dev, single-line JSON in production
  (`LOG_FORMAT=json`) so both services' logs parse the same way in an
  aggregator (the Next.js logger already emits JSON in production).

Content policy: INFO and above must stay free of user message content.
Queries, tool arguments, and generated text are logged at DEBUG only.
"""

import json
import logging
from contextvars import ContextVar

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

TEXT_FORMAT = "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s"


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname.lower(),
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging(level: str, log_format: str) -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(
        JsonFormatter() if log_format == "json" else logging.Formatter(TEXT_FORMAT)
    )
    root = logging.getLogger()
    root.setLevel(level.upper())
    root.handlers = [handler]


class RequestIdMiddleware:
    """Pure ASGI middleware: binds the gateway's X-Request-Id (or a dash
    when absent, e.g. /health probes) for the lifetime of the request,
    including the streamed response body."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            header = next(
                (v for k, v in scope.get("headers", []) if k == b"x-request-id"),
                None,
            )
            if header:
                request_id_var.set(header.decode("latin-1")[:64])
        await self.app(scope, receive, send)
