from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import DateTime, Text, Boolean, func, ForeignKey, false
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
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
