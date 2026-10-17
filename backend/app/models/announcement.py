from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Announcement(Base):
    """Platformdan işletme panellerine duyuru (banner). target_all=false ise announcement_targets'taki işletmelere."""
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    level: Mapped[str] = mapped_column(String(10), server_default="info")  # info | warning | critical
    target_all: Mapped[bool] = mapped_column(Boolean, server_default="true")
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AnnouncementTarget(Base):
    __tablename__ = "announcement_targets"

    announcement_id: Mapped[int] = mapped_column(ForeignKey("announcements.id", ondelete="CASCADE"), primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)

    __table_args__ = (Index("idx_announcement_targets_tenant", "tenant_id"),)
