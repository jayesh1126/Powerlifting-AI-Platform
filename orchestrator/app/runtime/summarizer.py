"""Rolling conversation summary.

Port of getNewChatSummary from the old app's openai.server.ts. Summaries
are AI, so this lives in the runtime — the gateway only stores what comes
back in the `summary` stream event. The cadence (which turns refresh the
summary) is decided by the context builder.
"""

import logging

from app.config import get_settings
from app.llm import get_chat_client
from app.models import ChatMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a summarizer for a powerlifting assistant chat.
Your task: maintain a running summary of the conversation.
- If an existing summary is provided, update/expand it with the new messages.
- If no summary exists, create a new one.
- Keep it concise, ~2-3 sentences max.
- Preserve important topics (bench, squat, deadlift, program design, nutrition, etc)."""


async def summarize(
    existing_summary: str | None, messages: list[ChatMessage]
) -> str | None:
    """Returns the refreshed summary, or None if it couldn't be produced
    (the gateway then keeps the old one)."""
    client = get_chat_client()
    if client is None:
        # No LLM: naive concat fallback so dev mode still exercises the path.
        tail = " | ".join(f"{m.role}: {m.content[:80]}" for m in messages[-4:])
        combined = (existing_summary + " | " if existing_summary else "") + tail
        return combined[-1500:]

    user_content = f"""Existing summary:
{existing_summary or "(none)"}

Last messages:
{chr(10).join(f"{m.role}: {m.content}" for m in messages)}"""

    try:
        response = await client.chat.completions.create(
            model=get_settings().summarizer_model,
            temperature=0.3,
            max_tokens=400,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
        summary = (response.choices[0].message.content or "").strip()
        return summary or None
    except Exception:
        logger.exception("summary generation failed")
        return None
