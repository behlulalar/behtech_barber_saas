import secrets
import string

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, Text, func, true
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from datetime import datetime

_TOKEN_ALPHABET = string.ascii_lowercase + string.digits


def new_login_token() -> str:
    """Panel giriş adresinin gizli parçası: 12 karakter (36^12 ≈ 4,7e18 olasılık), tahmin edilemez."""
    return "".join(secrets.choice(_TOKEN_ALPHABET) for _ in range(12))


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    # Abonelik süresi dolduğu için görev tarafından kapatıldıysa dolu (manuel kapatmada null).
    auto_suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Personel paneli giriş adresinin gizli parçası: /panel/g/<login_token>. Giriş uçları bunu ister (yalnızca arayüz gizliliği değil).
    login_token: Mapped[str] = mapped_column(String(24), unique=True, default=new_login_token)
    # Kendi kayıt olan işletmeler: 'pending' (onay bekliyor) | 'approved' | 'rejected'. Platformdan açılanlarda null.
    signup_status: Mapped[str | None] = mapped_column(String(10), nullable=True)

    __table_args__ = (
        CheckConstraint("slug ~ '^[a-z0-9-]+$'"),
    )


