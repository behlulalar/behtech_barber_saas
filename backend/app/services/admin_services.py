"""Personel paneli iş mantığı. Her fonksiyon tenant_id alır ve HER sorguyu o tenant'a kısıtlar."""
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment, AppointmentStatus
from app.models.customer import Customers
from app.models.service import Service
from app.models.staff import RoleType, Staff
from app.models.staff_service import StaffService
from app.schemas.admin import (
    AdminAppointmentOut,
    AdminServiceOut,
    CustomerRef,
    ServiceRef,
    StaffAdminOut,
    StaffRef,
)

SLOT_TAKEN = "Bu saat dolu, lütfen başka bir saat seçin"


# ---------- genel yardımcılar ----------
async def commit_or_409(db: AsyncSession, message: str) -> None:
    """commit eder; unique ihlali olursa rollback + 409."""
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=message)


async def get_staff_in_tenant(db: AsyncSession, tenant_id: int, staff_id: int) -> Staff:
    staff = (
        await db.execute(select(Staff).where(Staff.id == staff_id, Staff.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    return staff


async def has_appointments(db: AsyncSession, tenant_id: int, **column_filters) -> bool:
    conds = [Appointment.tenant_id == tenant_id] + [getattr(Appointment, k) == v for k, v in column_filters.items()]
    row = (await db.execute(select(Appointment.id).where(*conds).limit(1))).first()
    return row is not None


async def flush_or_409(db: AsyncSession, message: str) -> None:
    """flush eder (ör. yeni satırın id'si lazım); unique ihlali olursa rollback + 409."""
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=message)


# ---------- personel ↔ hizmet (staff_services) ----------
# Kural: bir berber yalnızca staff_services'te bağlı olduğu hizmetleri verir.
# Teknik destek hesapları müşteriye görünmediği için varsayılan "herkes" listesine girmez.

async def _links(db: AsyncSession, tenant_id: int) -> list[tuple[int, int]]:
    rows = await db.execute(
        select(StaffService.staff_id, StaffService.service_id).where(StaffService.tenant_id == tenant_id)
    )
    return [(staff_id, service_id) for staff_id, service_id in rows.all()]


async def service_ids_by_staff(db: AsyncSession, tenant_id: int) -> dict[int, list[int]]:
    out: dict[int, list[int]] = {}
    for staff_id, service_id in await _links(db, tenant_id):
        out.setdefault(staff_id, []).append(service_id)
    return out


async def staff_ids_by_service(db: AsyncSession, tenant_id: int) -> dict[int, list[int]]:
    out: dict[int, list[int]] = {}
    for staff_id, service_id in await _links(db, tenant_id):
        out.setdefault(service_id, []).append(staff_id)
    return out


async def bookable_staff_ids(db: AsyncSession, tenant_id: int) -> list[int]:
    rows = await db.execute(
        select(Staff.id).where(Staff.tenant_id == tenant_id, Staff.role != RoleType.TECHNICAL_SUPPORT)
    )
    return list(rows.scalars().all())


async def all_service_ids(db: AsyncSession, tenant_id: int) -> list[int]:
    rows = await db.execute(select(Service.id).where(Service.tenant_id == tenant_id))
    return list(rows.scalars().all())


async def _ensure_in_tenant(db: AsyncSession, tenant_id: int, model, ids: list[int], message: str) -> set[int]:
    wanted = set(ids)
    if not wanted:
        return wanted
    found = await db.execute(select(model.id).where(model.tenant_id == tenant_id, model.id.in_(wanted)))
    if set(found.scalars().all()) != wanted:
        raise HTTPException(status_code=400, detail=message)
    return wanted


async def set_service_staff(db: AsyncSession, tenant_id: int, service_id: int, staff_ids: list[int]) -> None:
    """Hizmeti veren personeli verilen listeyle değiştirir (commit etmez)."""
    wanted = await _ensure_in_tenant(db, tenant_id, Staff, staff_ids, "Seçilen personellerden biri bulunamadı")
    await db.execute(
        delete(StaffService).where(StaffService.tenant_id == tenant_id, StaffService.service_id == service_id)
    )
    db.add_all(StaffService(tenant_id=tenant_id, staff_id=sid, service_id=service_id) for sid in wanted)


async def set_staff_services(db: AsyncSession, tenant_id: int, staff_id: int, service_ids: list[int]) -> None:
    """Personelin verdiği hizmetleri verilen listeyle değiştirir (commit etmez)."""
    wanted = await _ensure_in_tenant(db, tenant_id, Service, service_ids, "Seçilen hizmetlerden biri bulunamadı")
    await db.execute(
        delete(StaffService).where(StaffService.tenant_id == tenant_id, StaffService.staff_id == staff_id)
    )
    db.add_all(StaffService(tenant_id=tenant_id, staff_id=staff_id, service_id=sid) for sid in wanted)


def service_out(service: Service, staff_ids: list[int]) -> AdminServiceOut:
    return AdminServiceOut.model_validate(service).model_copy(update={"staff_ids": sorted(staff_ids)})


def staff_out(staff: Staff, service_ids: list[int]) -> StaffAdminOut:
    return StaffAdminOut.model_validate(staff).model_copy(update={"service_ids": sorted(service_ids)})


# ---------- randevular ----------
def _to_out(appt: Appointment, staff: Staff, service: Service, customer: Customers) -> AdminAppointmentOut:
    return AdminAppointmentOut(
        id=appt.id,
        appointment_date=appt.appointment_date,
        appointment_time=appt.appointment_time,
        status=appt.status,
        payment_method=appt.payment_method,
        created_at=appt.created_at,
        staff=StaffRef.model_validate(staff),
        service=ServiceRef.model_validate(service),
        customer=CustomerRef.model_validate(customer),
    )


def _appointment_query(tenant_id: int):
    # Tek sorguda 4 tabloyu birleştirip iç içe çıktıyı kuruyoruz (N+1 yok).
    return (
        select(Appointment, Staff, Service, Customers)
        .join(Staff, Appointment.staff_id == Staff.id)
        .join(Service, Appointment.service_id == Service.id)
        .join(Customers, Appointment.customer_id == Customers.id)
        .where(Appointment.tenant_id == tenant_id)
    )


async def list_appointments(
    db: AsyncSession,
    tenant_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    staff_id: int | None = None,
    status: AppointmentStatus | None = None,
    limit: int = 2000,
) -> list[AdminAppointmentOut]:
    q = _appointment_query(tenant_id)
    if date_from:
        q = q.where(Appointment.appointment_date >= date_from)
    if date_to:
        q = q.where(Appointment.appointment_date <= date_to)
    if staff_id is not None:
        q = q.where(Appointment.staff_id == staff_id)
    if status is not None:
        q = q.where(Appointment.status == status)
    q = q.order_by(Appointment.appointment_date, Appointment.appointment_time, Appointment.id).limit(limit)
    rows = (await db.execute(q)).all()
    return [_to_out(*r) for r in rows]


async def get_appointment_out(db: AsyncSession, tenant_id: int, appointment_id: int) -> AdminAppointmentOut:
    row = (await db.execute(_appointment_query(tenant_id).where(Appointment.id == appointment_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    return _to_out(*row)


async def has_overlap(
    db: AsyncSession,
    tenant_id: int,
    staff_id: int,
    day: date,
    start: time,
    duration_min: int,
    exclude_id: int | None = None,
) -> bool:
    """Aynı personelin iptal edilmemiş başka bir randevusu bu aralıkla çakışıyor mu?"""
    new_start = datetime.combine(day, start)
    new_end = new_start + timedelta(minutes=duration_min)
    q = (
        select(Appointment.appointment_time, Service.duration_min)
        .join(Service, Appointment.service_id == Service.id)
        .where(
            Appointment.tenant_id == tenant_id,
            Appointment.staff_id == staff_id,
            Appointment.appointment_date == day,
            Appointment.status != AppointmentStatus.CANCELLED,
        )
    )
    if exclude_id is not None:
        q = q.where(Appointment.id != exclude_id)
    for t, dur in (await db.execute(q)).all():
        s = datetime.combine(day, t)
        if new_start < s + timedelta(minutes=dur) and new_end > s:
            return True
    return False


# ---------- dashboard ----------
async def build_dashboard(db: AsyncSession, tenant_id: int, day: date, only_staff_id: int | None):
    def scope(q):
        q = q.where(Appointment.tenant_id == tenant_id)
        if only_staff_id is not None:
            q = q.where(Appointment.staff_id == only_staff_id)
        return q

    S = AppointmentStatus
    revenue_statuses = (S.CANCELLED, S.NO_SHOW)

    today_q = scope(
        select(
            func.count(Appointment.id),
            func.count(case((Appointment.status == S.COMPLETED, 1))),
            func.count(case((Appointment.status == S.CANCELLED, 1))),
            func.count(case((Appointment.status == S.PENDING, 1))),
            func.coalesce(
                func.sum(case((Appointment.status.not_in(revenue_statuses), Service.price), else_=0)), 0
            ),
        )
        .join(Service, Appointment.service_id == Service.id)
        .where(Appointment.appointment_date == day)
    )
    total, completed, cancelled, pending, revenue = (await db.execute(today_q)).one()

    week_start = day - timedelta(days=day.weekday())  # Pazartesi
    week_end = week_start + timedelta(days=6)
    week_q = scope(
        select(func.count(Appointment.id)).where(
            Appointment.appointment_date >= week_start, Appointment.appointment_date <= week_end
        )
    )
    week_count = (await db.execute(week_q)).scalar_one()

    if only_staff_id is None:
        cust_q = select(func.count(Customers.id)).where(Customers.tenant_id == tenant_id)
    else:
        cust_q = select(func.count(func.distinct(Appointment.customer_id))).where(
            Appointment.tenant_id == tenant_id, Appointment.staff_id == only_staff_id
        )
    total_customers = (await db.execute(cust_q)).scalar_one()

    now = datetime.now()
    today, now_t = now.date(), now.time()
    upcoming_q = (
        _appointment_query(tenant_id)
        .where(
            Appointment.status != AppointmentStatus.CANCELLED,
            or_(
                Appointment.appointment_date > today,
                and_(Appointment.appointment_date == today, Appointment.appointment_time >= now_t),
            ),
        )
        .order_by(Appointment.appointment_date, Appointment.appointment_time)
        .limit(5)
    )
    if only_staff_id is not None:
        upcoming_q = upcoming_q.where(Appointment.staff_id == only_staff_id)
    upcoming = [_to_out(*r) for r in (await db.execute(upcoming_q)).all()]

    return {
        "date": day,
        "appointments_today": total,
        "completed_today": completed,
        "cancelled_today": cancelled,
        "pending_today": pending,
        "expected_revenue_today": int(revenue),
        "appointments_this_week": week_count,
        "total_customers": total_customers,
        "upcoming": upcoming,
    }


# ---------- müşteriler ----------
async def list_customers(db: AsyncSession, tenant_id: int, q: str | None, limit: int = 200):
    stmt = (
        select(
            Customers,
            func.count(Appointment.id).label("cnt"),
            func.max(Appointment.appointment_date).label("last_date"),
        )
        .outerjoin(
            Appointment,
            and_(Appointment.customer_id == Customers.id, Appointment.tenant_id == tenant_id),
        )
        .where(Customers.tenant_id == tenant_id)
        .group_by(Customers.id)
    )
    if q and q.strip():
        term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{term}%"
        full_name = func.concat(Customers.name, " ", Customers.surname)
        stmt = stmt.where(
            or_(
                Customers.name.ilike(pattern, escape="\\"),
                Customers.surname.ilike(pattern, escape="\\"),
                Customers.phone.ilike(pattern, escape="\\"),
                full_name.ilike(pattern, escape="\\"),
            )
        )
    stmt = stmt.order_by(Customers.name, Customers.surname, Customers.id).limit(limit)
    return [
        {
            "id": c.id,
            "name": c.name,
            "surname": c.surname,
            "phone": c.phone,
            "created_at": c.created_at,
            "appointment_count": cnt,
            "last_appointment_date": last,
        }
        for c, cnt, last in (await db.execute(stmt)).all()
    ]


async def delete_working_hours(db: AsyncSession, tenant_id: int, staff_id: int) -> None:
    from app.models.working_hours import WorkingHours

    await db.execute(
        delete(WorkingHours).where(WorkingHours.tenant_id == tenant_id, WorkingHours.staff_id == staff_id)
    )
