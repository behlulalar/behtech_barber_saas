from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SupportTicket(Base):
    """İşletmenin platforma yazdığı destek talebi. Yanıt, işletmenin bildirim kutusuna düşer (Notification) ve talep kapanır."""
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"), nullable=True)
    category: Mapped[str] = mapped_column(String(20))  # whatsapp | appointments | payment | other
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), server_default="open")  # open | closed
    reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (Index("idx_support_tickets_status", "status", "created_at"), Index("idx_support_tickets_tenant", "tenant_id"))
