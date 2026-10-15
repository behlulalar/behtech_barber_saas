from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ImpersonationCode(Base):
    """Destek girişi için tek kullanımlık, 60 sn ömürlü kod. Yalnızca sha256 özeti saklanır."""
    __tablename__ = "impersonation_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    platform_admin_id: Mapped[int] = mapped_column(ForeignKey("platform_admins.id", ondelete="CASCADE"))
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"))
    read_only: Mapped[bool] = mapped_column(Boolean, server_default="false")
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_impersonation_codes_tenant_id", "tenant_id"),)
