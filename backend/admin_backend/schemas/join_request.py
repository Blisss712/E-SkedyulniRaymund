from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class JoinRequestCreate(BaseModel):
    memberName: str = Field(min_length=1, max_length=150)
    groupCode: str = Field(min_length=1, max_length=80)
    groupName: str = Field(min_length=1, max_length=150)


class JoinRequestStatusUpdate(BaseModel):
    status: Literal["approved", "rejected"]


class JoinRequestView(JoinRequestCreate):
    id: str
    status: Literal["pending", "approved", "rejected"]
    requestedAt: datetime
    reviewedAt: datetime | None = None
