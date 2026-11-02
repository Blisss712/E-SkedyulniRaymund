from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

class EventBase(BaseModel):
    organizationId: str
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=5000)
    startsAt: datetime
    endsAt: datetime
    location: str = Field(min_length=1, max_length=255)
    capacity: int = Field(default=50, ge=1)
    registrationDeadline: datetime | None = None
    visibility: Literal["public", "members"] = "members"
    recurrence: Literal["none", "weekly", "monthly"] = "none"
    repeatUntil: date | datetime | None = None
    status: Literal["draft", "published", "cancelled", "completed"] = "draft"

    @field_validator("title", "location")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required.")
        return value

    @field_validator("registrationDeadline", "repeatUntil", mode="before")
    @classmethod
    def blank_optional_dates_are_empty(cls, value):
        return None if value == "" else value

class EventCreate(EventBase):
    pass

class EventUpdate(EventBase):
    pass

class EventConflictCheck(EventBase):
    excludeId: str | None = None

class EventView(EventBase):
    id: str
    createdAt: str
