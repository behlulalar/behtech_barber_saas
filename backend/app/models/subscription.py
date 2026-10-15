from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id", ondelete="SET NULL"))
    plan_name: Mapped[str] = mapped_column(String(100))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    price: Mapped[int] = mapped_column(Integer, server_default="0")
    note: Mapped[str | None] = mapped_column(Text)
    is_trial: Mapped[bool] = mapped_column(Boolean, server_default="false")
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_notified_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_subscriptions_dates"),
        CheckConstraint("price >= 0", name="ck_subscriptions_price"),
        Index("idx_subscriptions_tenant_id", "tenant_id"),
    )
