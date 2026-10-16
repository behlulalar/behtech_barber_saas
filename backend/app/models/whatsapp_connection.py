from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WhatsappConnection(Base):
    """Dükkânın KENDİ WhatsApp hesabı (Evolution instance'ı). Dükkânın tüm doğrulama/şifre mesajları buradan gider.
    state: Evolution bağlantı durumu — 'open' (bağlı) | 'connecting' (QR/kod bekliyor) | 'close' (bağlı değil)."""
    __tablename__ = "whatsapp_connections"

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    instance_name: Mapped[str] = mapped_column(String(60), unique=True)
    state: Mapped[str] = mapped_column(String(20), server_default="close")
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)  # bağlı numara (90...)
    profile_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
