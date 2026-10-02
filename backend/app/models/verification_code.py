from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import DateTime, String, func, ForeignKey, Boolean, false, Index
from app.core.database import Base
from datetime import datetime


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    phone: Mapped[str] = mapped_column(String(10))
    code: Mapped[str] = mapped_column(String(6))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    is_used: Mapped[bool] = mapped_column(Boolean, server_default=false())

    __table_args__ = (
        Index("idx_verification_codes_tenant_id", "tenant_id"),
    )
