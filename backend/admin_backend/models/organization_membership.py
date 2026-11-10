
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class OrganizationMembership(Base):
    """Record an admin's membership in an organization."""

    __tablename__ = "organization_members"

    organization_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("admin_profiles.user_id", ondelete="CASCADE"),
        primary_key=True,
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
