from sqlalchemy import CheckConstraint, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PlatformSettings(Base):
    """Tek satırlık tablo (id=1); migration oluşturur."""

    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    iban: Mapped[str | None] = mapped_column(String(34))
    account_holder: Mapped[str | None] = mapped_column(String(255))
    bank_name: Mapped[str | None] = mapped_column(String(255))
    reminder_days: Mapped[int] = mapped_column(Integer, server_default="3")
    grace_days: Mapped[int] = mapped_column(Integer, server_default="7")
    notify_email: Mapped[str | None] = mapped_column(String(255))
    reminder_template: Mapped[str] = mapped_column(Text)
    overdue_template: Mapped[str] = mapped_column(Text)
    trial_template: Mapped[str] = mapped_column(Text)

    __table_args__ = (CheckConstraint("id = 1", name="ck_platform_settings_single_row"),)
