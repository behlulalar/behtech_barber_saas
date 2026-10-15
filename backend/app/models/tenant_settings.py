from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import DateTime, String, Text, Boolean, func, ForeignKey, false
from app.core.database import Base
from datetime import datetime


class TenantSettings(Base):
    __tablename__ = "tenant_settings"

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True
    )
    banner_image: Mapped[str | None] = mapped_column(Text)
    logo_image: Mapped[str | None] = mapped_column(Text)
    notification_banner_enabled: Mapped[bool] = mapped_column(Boolean, server_default=false())
    business_name: Mapped[str] = mapped_column(Text)
    business_adress: Mapped[str] = mapped_column(Text)
    # Müşteri sitesinde gösterilen iletişim bilgileri (hepsi isteğe bağlı; 10 hane, başında 0/90 yok ve Instagram kullanıcı adı).
    contact_phone: Mapped[str | None] = mapped_column(String(10))
    whatsapp_phone: Mapped[str | None] = mapped_column(String(10))
    instagram: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
