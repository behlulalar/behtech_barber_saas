from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MessageLog(Base):
    """Giden WhatsApp mesajı kaydı (içerik/telefon YAZILMAZ): işletme başına hız sınırı ve durum paneli için."""
    __tablename__ = "message_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20))  # otp | password_reset
    ok: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_message_logs_tenant_created", "tenant_id", "created_at"),
        Index("idx_message_logs_created", "created_at"),
    )
