from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AssistantTurn(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(min_length=1, max_length=4000)


class AssistantChatInput(BaseModel):
    """The grounded data block plus the recent chat turns from the browser."""

    context: str = Field(min_length=1, max_length=60_000)
    messages: list[AssistantTurn] = Field(min_length=1, max_length=20)

    @field_validator("context")
    @classmethod
    def context_must_have_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Assistant context is required.")
        return value

    @field_validator("messages")
    @classmethod
    def must_end_with_a_question(
        cls, value: list[AssistantTurn]
    ) -> list[AssistantTurn]:
        if value[-1].role != "user":
            raise ValueError("The last assistant message must be the member's question.")
        return value
