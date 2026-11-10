from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from uuid import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class OrganizationJoinRequest(Base):
    __tablename__ = "organization_join_requests"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    member_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("member_profiles.user_id", ondelete="SET NULL"),
    )
    member_name: Mapped[str] = mapped_column(String(150), nullable=False)
    submitted_join_code: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("admin_profiles.user_id", ondelete="SET NULL"),
    )
    reviewer_note: Mapped[str] = mapped_column(Text, default="", nullable=False)
