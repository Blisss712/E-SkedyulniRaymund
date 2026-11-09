from datetime import date, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class RecurringAvailabilityInput(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    days: list[Literal["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]] = Field(
        min_length=1
    )
    startTime: time
    endTime: time

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.endTime <= self.startTime:
            raise ValueError("The end time must be after the start time.")
        return self


class AvailabilityOverrideInput(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    date: date
    type: Literal["free", "blocked"]
    startTime: time | None = None
    endTime: time | None = None

    @model_validator(mode="after")
    def validate_override(self):
        if self.type == "blocked":
            if self.startTime is not None or self.endTime is not None:
                raise ValueError("Blocked overrides cannot have a time range.")
        elif (
            self.startTime is None
            or self.endTime is None
            or self.endTime <= self.startTime
        ):
            raise ValueError("Free overrides need a valid time range.")
        return self


class NotificationInput(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    message: str = Field(default="", max_length=5000)
    kind: Literal["schedule", "approval", "slot", "event", "event_reminder"] = (
        "schedule"
    )

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Notification title is required.")
        return value
