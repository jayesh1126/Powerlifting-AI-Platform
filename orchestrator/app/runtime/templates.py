"""Shared prompt content loaded from orchestrator/content/."""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

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
