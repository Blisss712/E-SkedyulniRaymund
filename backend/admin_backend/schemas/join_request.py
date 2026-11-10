from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class JoinRequestCreate(BaseModel):
    memberName: str = Field(min_length=1, max_length=150)
    groupCode: str = Field(min_length=1, max_length=32)

    @field_validator("memberName", "groupCode")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required.")
        return value


class JoinRequestStatusUpdate(BaseModel):
    status: Literal["approved", "rejected"]


class JoinRequestView(BaseModel):
    id: str
    memberName: str
    groupCode: str
    groupName: str
    status: Literal["pending", "approved", "rejected"]
    requestedAt: datetime
    reviewedAt: datetime | None = None
