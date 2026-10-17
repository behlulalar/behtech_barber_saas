from sqlalchemy import func, select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.appointment import Appointment, AppointmentStatus
from app.models.working_hours import WorkingHours
from app.models.time_off import TimeOff
from app.models.service import Service
from app.models.staff import RoleType, Staff
from app.models.staff_service import StaffService
import math
from dataclasses import dataclass
from datetime import date, time, datetime
from app.core.config import settings

def _js_day_of_week(d: date) -> int:
    # Eski sistem (ve migrate edilen veri) day_of_week'i JS'in getDay()
    # kuralıyla saklıyor: 0=Pazar, 1=Pazartesi, ... 6=Cumartesi.
    # Python'ın date.weekday()'i ise 0=Pazartesi'dir, bu yüzden çeviriyoruz.
    return (d.weekday() + 1) % 7


async def lock_staff_schedule(db: Session, tenant_id: int, staff_id: int) -> None:
    # Unique index yalnızca birebir aynı başlangıç saatini korur; 15:00 ve 15:15 gibi örtüşen iki
    # eşzamanlı rezervasyonu engellemez. Berberin satırını transaction sonuna (commit/rollback)
    # kadar kilitleyerek aynı berbere gelen rezervasyonları sıraya sokuyoruz.
    # Bu yüzden kilitten sonra commit eden bir şey (ör. get_or_create_customer) çağrılmamalı.
    await db.execute(
        select(Staff.id).where(Staff.id == staff_id, Staff.tenant_id == tenant_id).with_for_update()
    )


SLOT_MINUTES = 30
DAY_MINUTES = 24 * 60


@dataclass
class SlotInfo:
    start: time
    end: time  # 24:00 için time(0, 0)
    status: str  # free | busy | past | off (saat aralıklı izin)
    bookable: bool


@dataclass
class SlotGrid:
    date: date
    duration_slots: int
    closed_reason: str | None  # None | day_off | time_off
    slots: list[SlotInfo]


def _minutes_to_time(minutes: int) -> time:
    minutes %= DAY_MINUTES
    return time(minutes // 60, minutes % 60)


def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


async def build_slot_grid(
    db: Session,
    tenant_id: int,
    staff_id: int,
    service_id: int,
    appointment_date: date,
    ignore_past: bool = False,
) -> SlotGrid:
    """30 dakikalık slot gridi. Başlangıçlar yalnızca :00/:30; bir randevu ceil(süre/30) slot kaplar.

    ignore_past=True (panelden geçmiş tarihli "tamamlandı" kaydı): geçmiş slotlar engel sayılmaz, dolu olanlar sayılır.
    """
    service_result = await db.execute(
        select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
    )
    service = service_result.scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")

    # İşten ayrılan (pasif) berber için randevu/slot yoktur.
    active = await db.execute(
        select(Staff.id).where(Staff.id == staff_id, Staff.tenant_id == tenant_id, Staff.is_active == True)  # noqa: E712
    )
    if active.first() is None:
        raise HTTPException(status_code=400, detail="Berber bulunamadı")

    # Berber yalnızca kendisine bağlı hizmetleri verir (staff_services).
    provides = await db.execute(
        select(StaffService.id).where(
            StaffService.tenant_id == tenant_id,
            StaffService.staff_id == staff_id,
            StaffService.service_id == service_id,
        )
    )
    if provides.first() is None:
        raise HTTPException(status_code=400, detail="Seçilen berber bu hizmeti vermiyor")

    needed = max(1, math.ceil(service.duration_min / SLOT_MINUTES))

    time_off_rows = (await db.execute(
        select(TimeOff.start_time, TimeOff.end_time).where(
            TimeOff.tenant_id == tenant_id,
            TimeOff.staff_id == staff_id,
            TimeOff.start_date <= appointment_date,
            TimeOff.end_date >= appointment_date,
        )
    )).all()
    if any(st is None for st, _ in time_off_rows):
        return SlotGrid(appointment_date, needed, "time_off", [])  # tüm gün izin
    # Saat aralıklı izinler: o gün yalnızca bu saatler kapalı (bitiş 00:00 = gün sonu)
    off_intervals = [
        (_time_to_minutes(st), (_time_to_minutes(en) or DAY_MINUTES)) for st, en in time_off_rows
    ]

    working_hours_result = await db.execute(
        select(WorkingHours).where(
            WorkingHours.tenant_id == tenant_id,
            WorkingHours.staff_id == staff_id,
            WorkingHours.day_of_week == _js_day_of_week(appointment_date),
        )
    )
    working_hours = working_hours_result.scalar_one_or_none()
    if working_hours is None:
        return SlotGrid(appointment_date, needed, "day_off", [])

    appointments_result = await db.execute(
        select(Appointment.appointment_time, Service.duration_min)
        .join(Service, Appointment.service_id == Service.id)
        .where(
            Appointment.tenant_id == tenant_id,
            Appointment.staff_id == staff_id,
            Appointment.appointment_date == appointment_date,
            Appointment.status != AppointmentStatus.CANCELLED,
        )
    )
    # Mevcut randevu [başlangıç, başlangıç + ceil(süre/30)*30) kaplar (eski :15 randevular kesişime göre bloklar).
    busy_intervals = [
        (
            _time_to_minutes(existing_time),
            _time_to_minutes(existing_time) + math.ceil(existing_duration / SLOT_MINUTES) * SLOT_MINUTES,
        )
        for existing_time, existing_duration in appointments_result.all()
    ]

    work_start = _time_to_minutes(working_hours.start_time)
    work_end = _time_to_minutes(working_hours.end_time)
    if work_end <= work_start:
        # Bitiş 00:00 ("gece yarısına kadar açığız") ya da bitiş <= başlangıç: günün sonu kabul edilir.
        work_end = DAY_MINUTES

    now = datetime.now()
    if appointment_date < now.date():
        past_until = DAY_MINUTES  # bütün gün geçmiş
    elif appointment_date == now.date():
        past_until = now.hour * 60 + now.minute  # başlangıcı <= şimdi olanlar geçmiş
    else:
        past_until = -1

    starts: list[int] = []
    first = math.ceil(work_start / SLOT_MINUTES) * SLOT_MINUTES
    start = first
    while start + SLOT_MINUTES <= work_end:
        starts.append(start)
        start += SLOT_MINUTES

    def is_past(s: int) -> bool:
        if appointment_date == now.date():
            return datetime.combine(appointment_date, _minutes_to_time(s)) <= now
        return s <= past_until

    statuses: list[str] = []
    for s in starts:
        if any(s < busy_end and s + SLOT_MINUTES > busy_start for busy_start, busy_end in busy_intervals):
            statuses.append("busy")
        elif any(s < off_end and s + SLOT_MINUTES > off_start for off_start, off_end in off_intervals):
            statuses.append("off")  # berber bu saatte izinli/kapalı (randevu alınamaz)
        elif is_past(s):
            statuses.append("past")
        else:
            statuses.append("free")

    def usable(status: str) -> bool:
        return status == "free" or (ignore_past and status == "past")

    slots: list[SlotInfo] = []
    for i, s in enumerate(starts):
        window = statuses[i : i + needed]
        bookable = len(window) == needed and all(usable(x) for x in window)
        slots.append(SlotInfo(_minutes_to_time(s), _minutes_to_time(s + SLOT_MINUTES), statuses[i], bookable))
    return SlotGrid(appointment_date, needed, None, slots)


async def get_available_slots(
    db: Session,
    tenant_id: int,
    staff_id: int,
    service_id: int,
    appointment_date: date,
    ignore_past: bool = False,
) -> list[time]:
    """Seçilebilir (bookable) başlangıç saatleri; gridden türetilir."""
    grid = await build_slot_grid(db, tenant_id, staff_id, service_id, appointment_date, ignore_past)
    return [s.start for s in grid.slots if s.bookable]


async def check_daily_limit(db: Session, tenant_id: int, customer_id: int, appointment_date: date) -> None:
    query = select(Appointment).where(Appointment.tenant_id == tenant_id, Appointment.customer_id == customer_id, Appointment.appointment_date == appointment_date, Appointment.status != AppointmentStatus.CANCELLED)
    result = await db.execute(query)
    all_appointments = result.scalars().all()

    # 0 = sınırsız (limit kapalı).
    if settings.daily_appointment_limit > 0 and len(all_appointments) >= settings.daily_appointment_limit: 
        raise HTTPException(status_code=400, detail="Günlük randevu alma limitini aştınız.")

async def check_slot_available(db: Session, staff_id: int, appointment_date: date, appointment_time: time) -> None:
    query = select(Appointment).where(Appointment.staff_id == staff_id, Appointment.appointment_date == appointment_date, Appointment.appointment_time == appointment_time, Appointment.status != AppointmentStatus.CANCELLED)
    result = await db.execute(query)
    all_available_slots = result.scalar_one_or_none()

    if all_available_slots is not None:
        raise HTTPException(status_code=409, detail="Bu randevu dolu, lütfen başka bir saat deneyin!")
     


async def staff_for_service(db: Session, tenant_id: int, service_id: int) -> list[Staff]:
    """Bu hizmeti veren aktif berberler (teknik destek hariç), id sırasıyla."""
    rows = await db.execute(
        select(Staff)
        .join(StaffService, (StaffService.staff_id == Staff.id) & (StaffService.tenant_id == tenant_id))
        .where(
            Staff.tenant_id == tenant_id, Staff.is_active == True,  # noqa: E712
            Staff.role != RoleType.TECHNICAL_SUPPORT, StaffService.service_id == service_id,
        )
        .order_by(Staff.id)
    )
    return list(rows.scalars().all())


# Birleşik durumda aynı saat için berberlerin durumları arasından gösterilecek olan (küçük = öncelikli).
_STATUS_RANK = {"free": 0, "busy": 1, "off": 2, "past": 3}


async def build_merged_slot_grid(db: Session, tenant_id: int, service_id: int, appointment_date: date) -> SlotGrid:
    """"Fark etmez" için: hizmeti veren tüm berberlerin gridlerini birleştirir. Bir saat, en az bir berber alabiliyorsa seçilebilir."""
    service = (await db.execute(select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id))).scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    needed = max(1, math.ceil(service.duration_min / SLOT_MINUTES))
    team = await staff_for_service(db, tenant_id, service_id)
    grids = [await build_slot_grid(db, tenant_id, m.id, service_id, appointment_date) for m in team]
    if not grids:
        return SlotGrid(appointment_date, needed, "day_off", [])
    open_grids = [g for g in grids if g.closed_reason is None]
    if not open_grids:
        reasons = {g.closed_reason for g in grids}
        return SlotGrid(appointment_date, needed, "time_off" if reasons == {"time_off"} else "day_off", [])
    merged: dict[time, SlotInfo] = {}
    for g in open_grids:
        for sl in g.slots:
            cur = merged.get(sl.start)
            if cur is None:
                merged[sl.start] = SlotInfo(sl.start, sl.end, sl.status, sl.bookable)
            elif sl.bookable and not cur.bookable:
                merged[sl.start] = SlotInfo(sl.start, sl.end, "free", True)
            elif not cur.bookable and not sl.bookable and _STATUS_RANK[sl.status] < _STATUS_RANK[cur.status]:
                merged[sl.start] = SlotInfo(sl.start, sl.end, sl.status, False)
    slots = [merged[k] for k in sorted(merged, key=_time_to_minutes)]
    return SlotGrid(appointment_date, needed, None, slots)


async def pick_staff_for_slot(db: Session, tenant_id: int, service_id: int, appointment_date: date, appointment_time: time) -> Staff:
    """"Fark etmez": o saati alabilen berberler arasından o gün en az randevusu olanı seçer (eşitlikte küçük id).
    Berber satırları deterministik (id) sırayla kilitlenir: eşzamanlı isteklerde kilit sırası aynı kalır, kilitlenme olmaz.
    Kilitler çağıran transaction'ın sonuna kadar sürer (arada commit çağrılmamalı)."""
    team = await staff_for_service(db, tenant_id, service_id)
    for m in team:
        await lock_staff_schedule(db, tenant_id, m.id)
    wanted = appointment_time.replace(second=0, microsecond=0)
    candidates: list[Staff] = []
    for m in team:
        slots = await get_available_slots(db, tenant_id, m.id, service_id, appointment_date)
        if wanted in {t.replace(second=0, microsecond=0) for t in slots}:
            candidates.append(m)
    if not candidates:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu saat artık müsait değil, lütfen başka bir saat seçin")
    loads = dict((await db.execute(
        select(Appointment.staff_id, func.count()).where(
            Appointment.tenant_id == tenant_id, Appointment.appointment_date == appointment_date,
            Appointment.status != AppointmentStatus.CANCELLED, Appointment.staff_id.in_([m.id for m in candidates]),
        ).group_by(Appointment.staff_id)
    )).all())
    return min(candidates, key=lambda m: (loads.get(m.id, 0), m.id))
