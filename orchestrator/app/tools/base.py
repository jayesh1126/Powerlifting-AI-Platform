"""Common tool interface.

Every capability the AI can use — SQL over meet results, knowledge
retrieval, future MCP servers or web search — implements this one
interface. The generator's tool loop neither knows nor cares what is
behind a tool; it only sees a name, a JSON schema, and a string result.
"""

import json
import logging
from abc import ABC, abstractmethod

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)


class Tool(ABC):
    """A capability exposed to the LLM via native tool calling."""

    name: str
    description: str
    params_model: type[BaseModel]

    def openai_schema(self) -> dict:
        """OpenAI function-calling schema, derived from the params model
        so the schema can never drift from the validation."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.params_model.model_json_schema(),
            },
        }

    async def run(self, raw_arguments: str) -> str:
        """Parse + validate the model's arguments, then execute.

        Always returns a string (JSON or an error message) — errors are fed
        back to the model so it can retry with corrected arguments instead
        of killing the request.
        """
        try:
            args = self.params_model.model_validate_json(raw_arguments or "{}")
        except ValidationError as e:
            # Validation detail includes the model's argument values (user
            # content) — keep it at DEBUG.
            logger.warning("tool %s got invalid args (%d issues)", self.name, len(e.errors()))
            logger.debug("tool %s validation detail: %s", self.name, e)
            return json.dumps({"error": f"Invalid arguments: {e.errors()}"})

        try:
            return await self.execute(args)
        except Exception:
            logger.exception("tool %s failed", self.name)
            return json.dumps({"error": f"Tool {self.name} failed. Try different arguments or answer without it."})

    @abstractmethod
    async def execute(self, args: BaseModel) -> str: ...
