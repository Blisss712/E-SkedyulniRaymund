from fastapi import APIRouter, Depends, Query

from ..config import Settings
from ..core.timekeeping import from_utc, get_zone
from ..database import Database
from ..schemas.common import ConflictResponse, EventResponse
from ..schemas.event import EventConflictCheck, EventCreate, EventUpdate
from ..services.event_service import EventService
from .deps import require_admin

router = APIRouter(prefix="/admin/events", tags=["Admin Events"])
settings = Settings.from_env()
database = Database(settings.database_url)

def to_response(item):
    return {
        "id": item.id,
        "organizationId": item.organization_id,
        "title": item.title,
        "description": item.description,
        "startsAt": local_datetime(item.starts_at, item.organization.timezone),
        "endsAt": local_datetime(item.ends_at, item.organization.timezone),
        "location": item.location,
        "capacity": item.capacity,
        "registrationDeadline": local_datetime(item.registration_deadline, item.organization.timezone) or "",
        "visibility": item.visibility,
        "recurrence": item.recurrence,
        "repeatUntil": (
            from_utc(item.repeat_until, get_zone(item.organization.timezone)).date().isoformat()
            if item.repeat_until
            else ""
        ),
        "status": item.status,
        "createdAt": item.created_at.date().isoformat(),
    }

def local_datetime(value, timezone_name):
    if value is None:
        return None
    local = from_utc(value, get_zone(timezone_name))
    precision = "seconds" if local.second or local.microsecond else "minutes"
    return local.replace(tzinfo=None).isoformat(timespec=precision)

@router.get("", response_model=list[EventResponse])
def list_events(query: str | None = Query(default=None), status: str | None = Query(default=None), _: dict = Depends(require_admin)):
    with database.session() as session:
        return [to_response(item) for item in EventService(session).list(query, status)]

@router.post("/conflicts", response_model=ConflictResponse)
def check_event_conflict(data: EventConflictCheck, _: dict = Depends(require_admin)):
    with database.session() as session:
        conflict = EventService(session).conflict(data, data.excludeId)
        return {
            "conflict": conflict is not None,
            "event": to_response(conflict) if conflict else None,
        }

@router.post("", response_model=EventResponse, status_code=201)
def create_event(data: EventCreate, _: dict = Depends(require_admin)):
    with database.session() as session:
        return to_response(EventService(session).save(data))


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: str, _: dict = Depends(require_admin)):
    with database.session() as session:
        return to_response(EventService(session).get(event_id))

@router.put("/{event_id}", response_model=EventResponse)
def update_event(event_id: str, data: EventUpdate, _: dict = Depends(require_admin)):
    with database.session() as session:
        return to_response(EventService(session).save(data, event_id))

@router.post("/{event_id}/duplicate", response_model=EventResponse, status_code=201)
def duplicate_event(event_id: str, _: dict = Depends(require_admin)):
    with database.session() as session:
        return to_response(EventService(session).duplicate(event_id))

@router.post("/{event_id}/cancel", response_model=EventResponse)
def cancel_event(event_id: str, _: dict = Depends(require_admin)):
    with database.session() as session:
        return to_response(EventService(session).cancel(event_id))

@router.delete("/{event_id}")
def delete_event(event_id: str, _: dict = Depends(require_admin)):
    with database.session() as session:
        EventService(session).delete(event_id)
        return {"message": "Event deleted successfully."}
