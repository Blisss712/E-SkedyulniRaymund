from datetime import date, datetime

from .errors import ConflictError, InvalidInputError

def require_text(value: str, field: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise InvalidInputError(f"{field} is required.")
    return cleaned

def validate_event_times(starts_at: datetime, ends_at: datetime) -> None:
    if ends_at <= starts_at:
        raise InvalidInputError("The end date and time must be after the start.")

def validate_registration_deadline(deadline: datetime | None, starts_at: datetime) -> None:
    if deadline and deadline > starts_at:
        raise InvalidInputError("Registration must close before the event starts.")

def validate_capacity(capacity: int) -> None:
    if capacity < 1:
        raise InvalidInputError("Capacity must be at least 1.")

def validate_repeat_until(recurrence: str, repeat_until: date | None, starts_at: datetime) -> None:
    if recurrence == "none":
        return
    if repeat_until is None:
        raise InvalidInputError("Repeat until is required for recurring events.")
    if repeat_until < starts_at.date():
        raise InvalidInputError("Repeat until must be on or after the event start date.")

def raise_duplicate(message: str) -> None:
    raise ConflictError(message)
