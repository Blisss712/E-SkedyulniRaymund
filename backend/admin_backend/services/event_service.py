from datetime import date, datetime, time, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from ..core.errors import ConflictError
from ..core.timekeeping import get_zone, to_utc
from ..core.validation import (
    require_text,
    validate_capacity,
    validate_event_times,
    validate_registration_deadline,
    validate_repeat_until,
)
from ..models.event import Event
from ..repositories.event_repository import EventRepository
from ..repositories.organization_repository import OrganizationRepository
from ..schemas.event import EventCreate, EventUpdate

class EventService:
    def __init__(self, session: Session):
        self.session = session
        self.events = EventRepository(session)
        self.organizations = OrganizationRepository(session)

    def list(self, query, status):
        return self.events.list(query, status)

    def get(self, event_id):
        return self.events.get(event_id)

    def save(self, data: EventCreate | EventUpdate, event_id=None):
        organization = self.organizations.get(data.organizationId)
        if organization.status == "inactive":
            raise ConflictError("The selected organization is inactive. Activate it before creating events.")
        title = require_text(data.title, "Event title")
        location = require_text(data.location, "Location")
        validate_capacity(data.capacity)
        zone = get_zone(organization.timezone)
        starts_local = data.startsAt.astimezone(zone) if data.startsAt.tzinfo else data.startsAt
        starts_at = to_utc(data.startsAt, zone)
        ends_at = to_utc(data.endsAt, zone)
        deadline = to_utc(data.registrationDeadline, zone) if data.registrationDeadline else None
        repeat_value = data.repeatUntil
        if isinstance(repeat_value, date) and not isinstance(repeat_value, datetime):
            repeat_value = datetime.combine(repeat_value, time.min)
        repeat_date = (
            repeat_value.astimezone(zone).date()
            if isinstance(repeat_value, datetime) and repeat_value.tzinfo
            else repeat_value.date() if isinstance(repeat_value, datetime)
            else None
        )
        validate_repeat_until(data.recurrence, repeat_date, starts_local)
        repeat_until = to_utc(repeat_value, zone) if repeat_value else None
        validate_event_times(starts_at, ends_at)
        validate_registration_deadline(deadline, starts_at)
        if data.recurrence == "none":
            repeat_until = None
        item = self.events.get(event_id) if event_id else Event(id=uuid4().hex, created_at=datetime.now(timezone.utc))
        item.organization_id = data.organizationId
        item.title = title
        item.description = data.description.strip()
        item.starts_at = starts_at
        item.ends_at = ends_at
        item.location = location
        item.capacity = data.capacity
        item.registration_deadline = deadline
        item.visibility = data.visibility
        item.recurrence = data.recurrence
        item.repeat_until = repeat_until
        item.status = data.status
        if not event_id:
            self.session.add(item)
        self.session.commit()
        return item

    def duplicate(self, event_id):
        source = self.events.get(event_id)
        duplicate = Event(
            id=uuid4().hex,
            organization_id=source.organization_id,
            title=f"{source.title} copy",
            description=source.description,
            starts_at=source.starts_at,
            ends_at=source.ends_at,
            location=source.location,
            capacity=source.capacity,
            registration_deadline=source.registration_deadline,
            visibility=source.visibility,
            recurrence=source.recurrence,
            repeat_until=source.repeat_until,
            status="draft",
            created_at=datetime.now(timezone.utc),
        )
        self.session.add(duplicate)
        self.session.commit()
        return duplicate

    def cancel(self, event_id):
        item = self.events.get(event_id)
        if item.status == "cancelled":
            raise ConflictError("This event is already cancelled.")
        item.status = "cancelled"
        self.session.commit()
        return item

    def delete(self, event_id):
        item = self.events.get(event_id)
        self.session.delete(item)
        self.session.commit()

    def conflict(self, data, exclude_id=None):
        organization = self.organizations.get(data.organizationId)
        zone = get_zone(organization.timezone)
        starts_at = to_utc(data.startsAt, zone)
        ends_at = to_utc(data.endsAt, zone)
        if ends_at <= starts_at:
            return None
        conflict = self.events.conflict(data.organizationId, data.location, starts_at, ends_at, exclude_id)
        return conflict
