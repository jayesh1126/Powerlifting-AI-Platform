import asyncio
from collections.abc import AsyncIterator

from app.models import ChatStreamRequest

STUB_RESPONSE = (
    "**[stub — program handler]** The real implementation will port the "
    "program-design pipeline (templates + periodisation logic) from "
    "ProgramHandler.server.ts. Your question was: "
)


async def handle_program(req: ChatStreamRequest) -> AsyncIterator[str]:
    """Training program design (port of ProgramHandler.server.ts)."""
    for token in (STUB_RESPONSE + f'"{req.message}"').split(" "):
        yield token + " "
        await asyncio.sleep(0.02)
