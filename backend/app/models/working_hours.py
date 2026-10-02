from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import Time,  func, ForeignKey, UniqueConstraint, DateTime, CheckConstraint, Index
from app.core.database import Base
from datetime import datetime, time


class WorkingHours(Base):
    __tablename__ = "working_hours"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"))
    day_of_week: Mapped[int]
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())


    __table_args__ = (
        CheckConstraint("day_of_week >= 0 AND day_of_week <= 6"),
        UniqueConstraint("staff_id", "day_of_week"),
        Index("idx_working_hours_tenant_id", "tenant_id"),
    )
