from typing import Literal

from pydantic import BaseModel, Field

ChatMode = Literal["general", "program", "openpowerlifting_analytics"]
ChatRole = Literal["User", "Assistant"]


class HistoryMessage(BaseModel):
    role: ChatRole
    content: str


class ChatStreamRequest(BaseModel):
    """Mirrors OrchestratorChatPayload in web/src/lib/orchestrator.ts."""

    user_id: str
    chat_id: str
    message: str = Field(min_length=1, max_length=2000)
    mode: ChatMode = "general"
    summary: str | None = None
    last_messages: list[HistoryMessage] = []


class SummarizeRequest(BaseModel):
    existing_summary: str | None = None
    messages: list[HistoryMessage]


class SummarizeResponse(BaseModel):
    summary: str
