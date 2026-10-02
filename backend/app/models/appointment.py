from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import Date, Time, String, func , ForeignKey, UniqueConstraint, DateTime, Boolean, false, Index
from app.core.database import Base
from datetime import datetime, date, time
from sqlalchemy import Enum as SAEnum
from enum import Enum

class AppointmentStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"))
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    appointment_date: Mapped[date] = mapped_column(Date)
    appointment_time: Mapped[time] = mapped_column(Time)
    status: Mapped[AppointmentStatus] = mapped_column(
        SAEnum(AppointmentStatus, name="appointment_status", values_callable=lambda enum_class: [member.value for member in enum_class])
    )
    payment_method: Mapped[str | None] = mapped_column(String)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, server_default=false())
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
     
    __table_args__ = (
        UniqueConstraint("staff_id", "appointment_date", "appointment_time"),
        Index("idx_appointments_tenant_id", "tenant_id"),
        Index("idx_appointments_customer_id", "customer_id"),
        Index("idx_appointments_service_id", "service_id"),
    )
    