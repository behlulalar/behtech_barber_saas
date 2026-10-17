from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy import Date, Integer, Time, String, func , ForeignKey, DateTime, Boolean, false, Index, text
from app.core.database import Base
from datetime import datetime, date, time
from sqlalchemy import Enum as SAEnum
from enum import Enum

class AppointmentStatus(str, Enum):
    PENDING = "pending"  # KULLANILMIYOR: randevular artık doğrudan CONFIRMED olarak oluşur (DB enum'unda kalır)
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"))
    # NO ACTION: personel satırı silinirse geçmiş randevu/gelir sessizce silinmesin (tenant silme yine zincirle çalışır).
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="NO ACTION"))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"))
    appointment_date: Mapped[date] = mapped_column(Date)
    appointment_time: Mapped[time] = mapped_column(Time)
    status: Mapped[AppointmentStatus] = mapped_column(
        SAEnum(AppointmentStatus, name="appointment_status", values_callable=lambda enum_class: [member.value for member in enum_class])
    )
    payment_method: Mapped[str | None] = mapped_column(String)
    # Randevu alındığı andaki hizmet fiyatı (₺). Hizmet fiyatı sonradan değişse de geçmiş randevu/rapor değişmez.
    # NULL = eski kayıt: raporlar hizmetin güncel fiyatına düşer (COALESCE).
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, server_default=false())
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
     
    __table_args__ = (
        # İptal edilen randevu o saati sonsuza kadar kilitlemesin diye kısmi unique index.
        Index(
            "uq_appointments_active_slot",
            "staff_id",
            "appointment_date",
            "appointment_time",
            unique=True,
            postgresql_where=text("status <> 'cancelled'"),
        ),
        Index("idx_appointments_tenant_id", "tenant_id"),
        Index("idx_appointments_customer_id", "customer_id"),
        Index("idx_appointments_service_id", "service_id"),
    )
    