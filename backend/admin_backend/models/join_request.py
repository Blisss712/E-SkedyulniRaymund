from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Uuid
from uuid import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class OrganizationJoinRequest(Base):
    __tablename__ = "organization_join_requests"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    member_name: Mapped[str] = mapped_column(String(150), nullable=False)
    group_code: Mapped[str] = mapped_column(String(80), nullable=False)
    group_name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
