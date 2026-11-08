from __future__ import annotations

from datetime import date, datetime, time
from uuid import UUID

from sqlalchemy import ARRAY, JSON, Date, DateTime, ForeignKey, Integer, String, Text, Time, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class RecurringAvailability(Base):
    __tablename__ = "member_recurring_availability"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("member_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    days: Mapped[list[str]] = mapped_column(
        ARRAY(Text).with_variant(JSON, "sqlite"), nullable=False
    )
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)


class AvailabilityOverride(Base):
    __tablename__ = "member_availability_overrides"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("member_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    override_date: Mapped[date] = mapped_column(Date, nullable=False)
    override_type: Mapped[str] = mapped_column(String(20), nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)


class VolunteerSlot(Base):
    __tablename__ = "volunteer_slots"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    slot_date: Mapped[date] = mapped_column(Date, nullable=False)
    slot_time: Mapped[time] = mapped_column(Time, nullable=False)
    mass_name: Mapped[str] = mapped_column(String(180), nullable=False)
    total_spots: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SlotSignup(Base):
    __tablename__ = "slot_signups"

    slot_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("volunteer_slots.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("member_profiles.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class MemberAssignment(Base):
    __tablename__ = "member_assignments"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("member_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    assignment_date: Mapped[date] = mapped_column(Date, nullable=False)
    assignment_time: Mapped[time] = mapped_column(Time, nullable=False)
    mass_name: Mapped[str] = mapped_column(String(180), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="schedule", nullable=False)
    event_id: Mapped[str | None] = mapped_column(
        String(40), ForeignKey("events.id", ondelete="CASCADE")
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
