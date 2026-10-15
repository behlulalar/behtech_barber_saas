from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LoginAttempt(Base):
    """Giriş denemeleri (brute force sınırı). scope: 'platform' | 'staff'.
    key: platform için telefon, personel için "<telefon>:<tenant_id>"."""
    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(String(20))
    key: Mapped[str] = mapped_column(String(120))
    ip: Mapped[str | None] = mapped_column(String(64))
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("idx_login_attempts_key", "scope", "key", "created_at"),
        Index("idx_login_attempts_ip", "ip", "created_at"),
    )
