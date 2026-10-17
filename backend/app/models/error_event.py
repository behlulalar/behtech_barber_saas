from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ErrorEvent(Base):
    """İşlenmemiş sunucu hataları (500). Yalnızca teknik özet: yol (sorgu parametresi YOK), yöntem, hata türü ve kısa mesaj. Kişisel veri tutulmaz."""
    __tablename__ = "error_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    method: Mapped[str] = mapped_column(String(8))
    path: Mapped[str] = mapped_column(String(200))
    error: Mapped[str] = mapped_column(String(200))
    status: Mapped[int] = mapped_column(Integer, server_default="500")

    __table_args__ = (Index("idx_error_events_at", "at"),)
