from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import CheckConstraint, DateTime, Date, Time, func, ForeignKey, String, Index
from app.core.database import Base
from datetime import date, datetime, time



class TimeOff(Base):
    __tablename__ = "time_off"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    reason: Mapped[str | None] = mapped_column(String(255))
    # Saat aralığı (isteğe bağlı): ikisi de boşsa TÜM GÜN kapalı. Doluysa aralıktaki günlerin HER BİRİNDE yalnızca bu saatler kapalı
    # (ör. 12:00-13:00 öğle arası). end_time 00:00 = gün sonu (çalışma saatlerindeki gibi). Saatler 30 dk ızgarasında (:00/:30).
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    __table_args__ = (
        Index("idx_time_off_tenant_id", "tenant_id"),
        CheckConstraint("(start_time IS NULL) = (end_time IS NULL)", name="ck_time_off_times_pair"),
    )
    