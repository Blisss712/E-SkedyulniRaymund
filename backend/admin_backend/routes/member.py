from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..config import Settings
from ..core.errors import ConflictError, NotFoundError
from ..database import Database
from ..models.member_data import (
    AvailabilityOverride,
    MemberAssignment,
    Notification,
    RecurringAvailability,
    SlotSignup,
    VolunteerSlot,
)
from ..models.member_profile import MemberProfile
from ..schemas.member import (
    AvailabilityOverrideInput,
    NotificationInput,
    RecurringAvailabilityInput,
)
from .deps import require_member

router = APIRouter(prefix="/member", tags=["Member"])
settings = Settings.from_env()
database = Database(settings.database_url)


def _time(value):
    return value.isoformat(timespec="minutes") if value else None


def _notification_response(item: Notification):
    return {
        "id": str(item.id),
        "title": item.title,
        "message": item.message,
        "kind": item.kind,
        "readAt": item.read_at.isoformat() if item.read_at else None,
        "createdAt": item.created_at.isoformat(),
    }


@router.get("/profile")
def get_profile(member: dict = Depends(require_member)):
    with database.session() as session:
        profile = session.get(MemberProfile, UUID(member["userId"]))
        if not profile:
            raise NotFoundError("Member profile not found.")
        return {
            "id": str(profile.user_id),
            "email": profile.email,
            "fullName": profile.full_name,
            "active": profile.active,
        }


@router.get("/availability")
def get_availability(member: dict = Depends(require_member)):
    user_id = UUID(member["userId"])
    with database.session() as session:
        recurring = session.scalars(
            select(RecurringAvailability)
            .where(RecurringAvailability.user_id == user_id)
            .order_by(RecurringAvailability.id)
        )
        overrides = session.scalars(
            select(AvailabilityOverride)
            .where(AvailabilityOverride.user_id == user_id)
            .order_by(AvailabilityOverride.override_date)
        )
        return {
            "recurring": [
                {
                    "id": item.id,
                    "days": item.days,
                    "startTime": _time(item.start_time),
                    "endTime": _time(item.end_time),
                }
                for item in recurring
            ],
            "overrides": [
                {
                    "id": item.id,
                    "date": item.override_date.isoformat(),
                    "type": item.override_type,
                    "startTime": _time(item.start_time),
                    "endTime": _time(item.end_time),
                }
                for item in overrides
            ],
        }


@router.put("/availability/recurring")
def save_recurring_availability(
    data: RecurringAvailabilityInput, member: dict = Depends(require_member)
):
    user_id = UUID(member["userId"])
    with database.session() as session:
        item = session.get(RecurringAvailability, data.id)
        if item and item.user_id != user_id:
            raise ConflictError("This availability entry belongs to another member.")
        if not item:
            item = RecurringAvailability(id=data.id, user_id=user_id, days=[])
            session.add(item)
        item.days = list(dict.fromkeys(data.days))
        item.start_time = data.startTime
        item.end_time = data.endTime
        session.commit()
        return {
            "id": item.id,
            "days": item.days,
            "startTime": _time(item.start_time),
            "endTime": _time(item.end_time),
        }


@router.delete("/availability/recurring/{entry_id}")
def delete_recurring_availability(
    entry_id: str, member: dict = Depends(require_member)
):
    with database.session() as session:
        item = session.get(RecurringAvailability, entry_id)
        if not item or str(item.user_id) != member["userId"]:
            raise NotFoundError("Availability entry not found.")
        session.delete(item)
        session.commit()
        return {"message": "Availability entry deleted."}


@router.put("/availability/overrides")
def save_availability_override(
    data: AvailabilityOverrideInput, member: dict = Depends(require_member)
):
    user_id = UUID(member["userId"])
    with database.session() as session:
        item = session.get(AvailabilityOverride, data.id)
        if item and item.user_id != user_id:
            raise ConflictError("This availability entry belongs to another member.")
        if not item:
            item = AvailabilityOverride(id=data.id, user_id=user_id)
            session.add(item)
        item.override_date = data.date
        item.override_type = data.type
        item.start_time = data.startTime
        item.end_time = data.endTime
        session.commit()
        return {
            "id": item.id,
            "date": item.override_date.isoformat(),
            "type": item.override_type,
            "startTime": _time(item.start_time),
            "endTime": _time(item.end_time),
        }


@router.delete("/availability/overrides/{entry_id}")
def delete_availability_override(
    entry_id: str, member: dict = Depends(require_member)
):
    with database.session() as session:
        item = session.get(AvailabilityOverride, entry_id)
        if not item or str(item.user_id) != member["userId"]:
            raise NotFoundError("Availability entry not found.")
        session.delete(item)
        session.commit()
        return {"message": "Availability entry deleted."}


@router.get("/slots")
def list_slots(member: dict = Depends(require_member)):
    user_id = UUID(member["userId"])
    with database.session() as session:
        slots = list(
            session.scalars(
                select(VolunteerSlot).order_by(
                    VolunteerSlot.slot_date, VolunteerSlot.slot_time
                )
            )
        )
        signup_counts = dict(
            session.execute(
                select(SlotSignup.slot_id, func.count())
                .group_by(SlotSignup.slot_id)
            ).all()
        )
        member_signups = set(
            session.scalars(
                select(SlotSignup.slot_id).where(SlotSignup.user_id == user_id)
            )
        )
        return [
            {
                "id": item.id,
                "date": item.slot_date.isoformat(),
                "time": item.slot_time.strftime("%I:%M %p").lstrip("0"),
                "massName": item.mass_name,
                "totalSpots": item.total_spots,
                "filledSpots": signup_counts.get(item.id, 0),
                "status": (
                    "serving"
                    if item.id in member_signups
                    else "filled"
                    if signup_counts.get(item.id, 0) >= item.total_spots
                    else "open"
                ),
            }
            for item in slots
        ]


@router.post("/slots/{slot_id}/signup", status_code=201)
def sign_up_for_slot(slot_id: str, member: dict = Depends(require_member)):
    user_id = UUID(member["userId"])
    with database.session() as session:
        item = session.scalar(
            select(VolunteerSlot)
            .where(VolunteerSlot.id == slot_id)
            .with_for_update()
        )
        if not item:
            raise NotFoundError("Volunteer slot not found.")
        if session.get(SlotSignup, {"slot_id": slot_id, "user_id": user_id}):
            raise ConflictError("You have already signed up for this slot.")
        filled = session.scalar(
            select(func.count()).select_from(SlotSignup).where(
                SlotSignup.slot_id == slot_id
            )
        ) or 0
        if filled >= item.total_spots:
            raise ConflictError("This volunteer slot is full.")
        session.add(
            SlotSignup(
                slot_id=slot_id,
                user_id=user_id,
                created_at=datetime.now(timezone.utc),
            )
        )
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise ConflictError("You have already signed up for this slot.") from exc
        return {"message": "You signed up for this slot."}


@router.delete("/slots/{slot_id}/signup")
def cancel_slot_signup(slot_id: str, member: dict = Depends(require_member)):
    with database.session() as session:
        signup = session.get(
            SlotSignup,
            {"slot_id": slot_id, "user_id": UUID(member["userId"])},
        )
        if not signup:
            raise NotFoundError("Your signup for this slot was not found.")
        session.delete(signup)
        session.commit()
        return {"message": "Your signup was cancelled."}


@router.get("/assignments")
def get_assignments(member: dict = Depends(require_member)):
    with database.session() as session:
        assignments = session.scalars(
            select(MemberAssignment)
            .where(MemberAssignment.user_id == UUID(member["userId"]))
            .order_by(MemberAssignment.assignment_date, MemberAssignment.assignment_time)
        )
        return [
            {
                "id": item.id,
                "date": item.assignment_date.isoformat(),
                "time": _time(item.assignment_time),
                "massName": item.mass_name,
                "role": item.role,
            }
            for item in assignments
        ]


@router.get("/notifications")
def list_notifications(member: dict = Depends(require_member)):
    with database.session() as session:
        notifications = session.scalars(
            select(Notification)
            .where(Notification.user_id == UUID(member["userId"]))
            .order_by(Notification.created_at.desc())
            .limit(50)
        )
        return [_notification_response(item) for item in notifications]


@router.post("/notifications", status_code=201)
def create_notification(
    data: NotificationInput, member: dict = Depends(require_member)
):
    with database.session() as session:
        item = Notification(
            id=uuid4(),
            user_id=UUID(member["userId"]),
            title=data.title,
            message=data.message.strip(),
            kind=data.kind,
            created_at=datetime.now(timezone.utc),
        )
        session.add(item)
        session.commit()
        return _notification_response(item)


@router.patch("/notifications/read")
def mark_all_notifications_read(member: dict = Depends(require_member)):
    with database.session() as session:
        items = session.scalars(
            select(Notification).where(
                Notification.user_id == UUID(member["userId"]),
                Notification.read_at.is_(None),
            )
        )
        now = datetime.now(timezone.utc)
        for item in items:
            item.read_at = now
        session.commit()
        return {"message": "Notifications marked as read."}


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: UUID, member: dict = Depends(require_member)
):
    with database.session() as session:
        item = session.get(Notification, notification_id)
        if not item or str(item.user_id) != member["userId"]:
            raise NotFoundError("Notification not found.")
        item.read_at = datetime.now(timezone.utc)
        session.commit()
        return _notification_response(item)


@router.delete("/notifications/{notification_id}")
def delete_notification(
    notification_id: UUID, member: dict = Depends(require_member)
):
    with database.session() as session:
        item = session.get(Notification, notification_id)
        if not item or str(item.user_id) != member["userId"]:
            raise NotFoundError("Notification not found.")
        session.delete(item)
        session.commit()
        return {"message": "Notification dismissed."}


@router.delete("/notifications")
def clear_notifications(member: dict = Depends(require_member)):
    with database.session() as session:
        items = session.scalars(
            select(Notification).where(
                Notification.user_id == UUID(member["userId"])
            )
        )
        for item in items:
            session.delete(item)
        session.commit()
        return {"message": "Notifications cleared."}
