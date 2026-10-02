from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import DateTime, func, ForeignKey, UniqueConstraint, String, Boolean, true, Index
from app.core.database import Base
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB

class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    details: Mapped[dict | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("name", "tenant_id"),
        Index("idx_payment_methods_tenant_id", "tenant_id"),
    )


