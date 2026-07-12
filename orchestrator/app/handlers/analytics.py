import asyncio
from collections.abc import AsyncIterator

from app.models import ChatStreamRequest

STUB_RESPONSE = (
    "**[stub — analytics handler]** The real implementation will port the "
    "OpenPowerlifting agent (LLM + SQL tools over the meet-results "
    "database) from AnalyticsHandler.server.ts. Your question was: "
)


async def handle_analytics(req: ChatStreamRequest) -> AsyncIterator[str]:
    """OpenPowerlifting analytics agent (port of AnalyticsHandler.server.ts)."""
    for token in (STUB_RESPONSE + f'"{req.message}"').split(" "):
        yield token + " "
        await asyncio.sleep(0.02)
