from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

if TYPE_CHECKING:
    from .event import Event


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(
        String(40),
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(
        String(150),
        unique=True,
        nullable=False,
    )
    description: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )
    contact_email: Mapped[str] = mapped_column(
        String(255),
        default="",
        nullable=False,
    )
    phone: Mapped[str] = mapped_column(
        String(50),
        default="",
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(
        String(80),
        default="Asia/Manila",
        nullable=False,
    )
    address: Mapped[str] = mapped_column(
        String(255),
        default="",
        nullable=False,
    )
    category: Mapped[str] = mapped_column(
        String(100),
        default="General",
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    events: Mapped[list["Event"]] = relationship(
        "Event",
        back_populates="organization",
    )