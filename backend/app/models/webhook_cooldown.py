from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import  func, ForeignKey, UniqueConstraint, DateTime, String
from app.core.database import Base
from datetime import datetime

class WebhookCooldown(Base):
    __tablename__ = "webhook_cooldown"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    phone: Mapped[str] = mapped_column(String(10))
    send_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("phone", "tenant_id"),
    )
