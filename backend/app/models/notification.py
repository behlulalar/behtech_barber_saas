from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Notification(Base):
    """Tek bir işletmeye giden bildirim (platformdan özel mesaj ya da sistem uyarısı, ör. WhatsApp koptu).
    read_at doludur = okundu/çözüldü; okunana kadar işletme panelinde şerit olarak görünür."""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))  # message | whatsapp
    level: Mapped[str] = mapped_column(String(10), server_default="info")  # info | warning | critical
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(200), nullable=True)  # panel içi yol, ör. /panel/whatsapp
    managers_only: Mapped[bool] = mapped_column(Boolean, server_default="false")
    dedupe_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (Index("idx_notifications_tenant_created", "tenant_id", "created_at"),)


class AnnouncementRead(Base):
    """Bir işletmenin duyuruyu okuduğu an (sunucuda tutulur; cihazdan bağımsız)."""
    __tablename__ = "announcement_reads"

    announcement_id: Mapped[int] = mapped_column(ForeignKey("announcements.id", ondelete="CASCADE"), primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    read_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
