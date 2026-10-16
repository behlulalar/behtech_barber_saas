from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func, true
from app.core.database import Base
from datetime import datetime

class PlatformAdmin(Base):
    __tablename__ = "platform_admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(10), unique=True)
    password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Artınca bu yöneticiye ait eski JWT'ler geçersiz olur (şifre değişimi, tüm cihazlardan çıkış, pasife alma).
    token_version: Mapped[int] = mapped_column(Integer, server_default="0", default=0)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    # --- İki aşamalı doğrulama (TOTP) ---
    totp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)  # Fernet ile şifreli; kurulum bitene kadar 'bekleyen'
    totp_enabled: Mapped[bool] = mapped_column(Boolean, server_default="false", default=False)
    totp_last_step: Mapped[int | None] = mapped_column(Integer, nullable=True)  # son kabul edilen 30 sn'lik adım (tekrar oynatma koruması)


class PlatformBackupCode(Base):
    """2FA yedek kodları (telefon kaybında). Yalnızca karması tutulur; kullanılınca used_at dolar."""
    __tablename__ = "platform_backup_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("platform_admins.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


