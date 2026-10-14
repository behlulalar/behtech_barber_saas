"""Geliştirme ortamı için sahte (mock) veriyle dükkânları doldurur. Tekrar çalıştırılabilir.

Kullanım:
    .venv/bin/python scripts/seed_mock_data.py            # doldur (önceki sahte kayıtları yenileyerek)
    .venv/bin/python scripts/seed_mock_data.py --reset    # yalnızca sahte müşteri+randevuları sil

Ne yapar (her dükkân için):
  * personel telefonları: sahip 5111111111, ikinci 5222222222, üçüncü 5333333333; şifre 123456
  * eksik personel/hizmet/ödeme yöntemi/çalışma saati/adres/izin kaydını tamamlar
  * 54000000NN numaralı SAHTE müşteriler + bunlara ait geçmiş/gelecek randevular üretir
Sahte kayıtlar yalnızca `54000000NN` telefonlu müşterilerdir; randevular onlara bağlıdır, bu yüzden
`--reset` (FK CASCADE) gerçek müşteri ve randevulara dokunmadan hepsini temizler. Gerçek randevuların
saatleriyle çakışan sahte randevu üretilmez. Üretimde ÇALIŞTIRMAYIN.
"""
import asyncio
import random
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select, update  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.config import settings  # noqa: E402
from app.core.database import SessionFactory, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.appointment import Appointment, AppointmentStatus  # noqa: E402
from app.models.customer import Customers  # noqa: E402
from app.models.payment_method import PaymentMethod  # noqa: E402
from app.models.service import Service  # noqa: E402
from app.models.staff import RoleType, Staff  # noqa: E402
from app.models.staff_service import StaffService  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.tenant_settings import TenantSettings  # noqa: E402
from app.models.time_off import TimeOff  # noqa: E402
from app.models.working_hours import WorkingHours  # noqa: E402
from app.services.appointment_services import _js_day_of_week  # noqa: E402

SHOPS = ["sefapertev", "demo", "deneme", "denemee"]
PASSWORD = "123456"
PHONES = ["5111111111", "5222222222", "5333333333"]  # sahip, 2. personel, 3. personel
MOCK_PREFIX = "54000000"
WORK_START, WORK_END = time(9, 0), time(20, 0)
PAST_DAYS, FUTURE_DAYS = 42, 14

# Yer tutucu ("deneme") adlı personel bu isimlerle yeniden adlandırılır; gerçek adlara dokunulmaz.
FALLBACK_STAFF = [("Murat", "Kaya"), ("Burak", "Aydın"), ("Emir", "Yıldız")]
DEFAULT_SERVICES = [
    ("Saç Kesimi", 450, 60), ("Sakal", 250, 30), ("Saç + Sakal", 650, 60),
    ("Çocuk Kesimi", 300, 30), ("Cilt Bakımı", 500, 60), ("Keratin", 1500, 90),
]
DEFAULT_ADDRESS = "Cumhuriyet Mah. Atatürk Cd. No: 24, Merkez"
CUSTOMER_NAMES = [
    ("Ahmet", "Demir"), ("Mehmet", "Çelik"), ("Mustafa", "Şahin"), ("Ali", "Öztürk"), ("Hüseyin", "Arslan"),
    ("İbrahim", "Doğan"), ("Yusuf", "Kılıç"), ("Murat", "Aksoy"), ("Can", "Erdem"), ("Cem", "Tunç"),
    ("Oğuz", "Polat"), ("Serkan", "Korkmaz"), ("Emre", "Güneş"), ("Burak", "Yalçın"), ("Kerem", "Aslan"),
    ("Onur", "Bulut"), ("Tolga", "Karaca"), ("Barış", "Özkan"), ("Selim", "Taş"), ("Volkan", "Işık"),
    ("Furkan", "Çakır"), ("Enes", "Uçar"), ("Gökhan", "Avcı"), ("Hakan", "Sönmez"), ("Berk", "Yavuz"),
    ("Eren", "Acar"), ("Kaan", "Duman"), ("Arda", "Bozkurt"),
]


def occupied_minutes(duration_min: int) -> int:
    """Randevunun kapladığı süre: ceil(süre/30) slot."""
    return -(-duration_min // 30) * 30


def minutes(t: time) -> int:
    return t.hour * 60 + t.minute


async def reset_mock(db, tenant_id: int) -> int:
    result = await db.execute(
        delete(Customers).where(Customers.tenant_id == tenant_id, Customers.phone.like(f"{MOCK_PREFIX}__"))
    )
    return result.rowcount or 0


async def seed_shop(db, slug: str, password_hash: str) -> str:
    tenant = (await db.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none()
    if tenant is None:
        return f"{slug}: dükkân yok, atlandı"
    tid = tenant.id
    rng = random.Random(f"mock-{slug}")
    now = datetime.now()
    today = now.date()

    if not tenant.is_active:
        tenant.is_active = True
        tenant.auto_suspended_at = None

    await reset_mock(db, tid)

    # ---- personel: en az 3 kişi; telefonlar/şifre
    staff = list((await db.execute(select(Staff).where(Staff.tenant_id == tid).order_by(Staff.id))).scalars())
    staff.sort(key=lambda s: (s.role != RoleType.SUPER_ADMIN, s.id))  # sahip önce
    fallback = iter(FALLBACK_STAFF)
    for s in staff:
        if s.name.strip().lower() == "deneme":
            s.name, s.surname = next(fallback)
    existing_names = {(s.name, s.surname) for s in staff}
    while len(staff) < 3:
        n, sn = next((x for x in FALLBACK_STAFF if x not in existing_names), ("Test", f"Berber{len(staff)}"))
        existing_names.add((n, sn))
        s = Staff(tenant_id=tid, name=n, surname=sn, phone=f"59999999{len(staff)}0", password=password_hash,
                  role=RoleType.STAFF)
        db.add(s)
        await db.flush()
        staff.append(s)
    # (tenant_id, phone) benzersiz: önce geçici numara, sonra asıl numara (karşılıklı çakışmayı önler).
    for i, s in enumerate(staff):
        s.phone = f"5999999{i:03d}"
    await db.flush()
    for i, s in enumerate(staff):
        s.phone = PHONES[i] if i < len(PHONES) else f"5{i}{i}{i}{i}{i}{i}{i}{i}{i}"
        s.password = password_hash
    await db.flush()
    bookable = [s for s in staff if s.role != RoleType.TECHNICAL_SUPPORT]

    # ---- hizmetler, ödeme yöntemleri, adres
    services = list((await db.execute(select(Service).where(Service.tenant_id == tid).order_by(Service.id))).scalars())
    if not services:
        for name, price, dur in DEFAULT_SERVICES:
            db.add(Service(tenant_id=tid, name=name, price=price, duration_min=dur, is_active=True))
        await db.flush()
        services = list((await db.execute(select(Service).where(Service.tenant_id == tid).order_by(Service.id))).scalars())
    pms = list((await db.execute(select(PaymentMethod).where(PaymentMethod.tenant_id == tid))).scalars())
    if not pms:
        for name in ("Nakit", "Kart"):
            db.add(PaymentMethod(tenant_id=tid, name=name, is_active=True))
        await db.flush()
        pms = list((await db.execute(select(PaymentMethod).where(PaymentMethod.tenant_id == tid))).scalars())
    pay_names = [p.name for p in pms if p.is_active] or ["Nakit"]
    ts = (await db.execute(select(TenantSettings).where(TenantSettings.tenant_id == tid))).scalar_one_or_none()
    if ts is not None and not (ts.business_adress or "").strip():
        ts.business_adress = DEFAULT_ADDRESS

    # ---- personel↔hizmet: hiç bağı olmayan personel tüm hizmetleri verir
    links = {(sid, vid) for sid, vid in (await db.execute(
        select(StaffService.staff_id, StaffService.service_id).where(StaffService.tenant_id == tid))).all()}
    for s in bookable:
        if not any(sid == s.id for sid, _ in links):
            for v in services:
                db.add(StaffService(tenant_id=tid, staff_id=s.id, service_id=v.id))
                links.add((s.id, v.id))

    # ---- çalışma saatleri: tanımsız personele Pzt-Cmt 09:00-20:00
    have_hours = set((await db.execute(select(WorkingHours.staff_id).where(WorkingHours.tenant_id == tid))).scalars())
    for s in bookable:
        if s.id not in have_hours:
            for day in range(1, 7):
                db.add(WorkingHours(tenant_id=tid, staff_id=s.id, day_of_week=day, start_time=WORK_START, end_time=WORK_END))
    await db.flush()

    # ---- izin: hiç izin kaydı yoksa 2. personele gelecek hafta 3 günlük izin
    if not (await db.execute(select(TimeOff.id).where(TimeOff.tenant_id == tid).limit(1))).first() and len(bookable) > 1:
        start = today + timedelta(days=9)
        db.add(TimeOff(tenant_id=tid, staff_id=bookable[1].id, start_date=start, end_date=start + timedelta(days=2),
                       reason="Yıllık izin"))
        await db.flush()

    # ---- sahte müşteriler
    customers = []
    for i in range(24):
        n, sn = CUSTOMER_NAMES[i % len(CUSTOMER_NAMES)]
        c = Customers(tenant_id=tid, name=n, surname=sn, phone=f"{MOCK_PREFIX}{i + 1:02d}")
        db.add(c)
        customers.append(c)
    await db.flush()

    # ---- sahte randevular
    hours = {}
    for w in (await db.execute(select(WorkingHours).where(WorkingHours.tenant_id == tid))).scalars():
        end = minutes(w.end_time)
        hours[(w.staff_id, w.day_of_week)] = (minutes(w.start_time), end if end > minutes(w.start_time) else 24 * 60)
    off = [(t.staff_id, t.start_date, t.end_date) for t in
           (await db.execute(select(TimeOff).where(TimeOff.tenant_id == tid))).scalars()]
    svc_by_id = {v.id: v for v in services}
    busy: dict[tuple[int, date], list[tuple[int, int]]] = {}
    for a in (await db.execute(select(Appointment).where(
            Appointment.tenant_id == tid, Appointment.status != AppointmentStatus.CANCELLED))).scalars():
        dur = occupied_minutes(svc_by_id[a.service_id].duration_min if a.service_id in svc_by_id else 60)
        busy.setdefault((a.staff_id, a.appointment_date), []).append(
            (minutes(a.appointment_time), minutes(a.appointment_time) + dur))

    days = [today + timedelta(days=d) for d in range(-PAST_DAYS, FUTURE_DAYS + 1)]
    target = 20 * len(bookable) * 3  # personel başına ~60 randevu
    placed = attempts = 0
    while placed < target and attempts < 20000:
        attempts += 1
        day = rng.choice(days)
        s = rng.choice(bookable)
        window = hours.get((s.id, _js_day_of_week(day)))
        if window is None or any(sid == s.id and a <= day <= b for sid, a, b in off):
            continue
        offered = [v for v in services if v.is_active and (s.id, v.id) in links]
        if not offered:
            continue
        v = rng.choice(offered)
        occ = occupied_minutes(v.duration_min)
        first = -(-window[0] // 30) * 30  # ilk :00/:30 başlangıcı
        if first + occ > window[1]:
            continue
        start_min = first + 30 * rng.randrange(0, (window[1] - occ - first) // 30 + 1)
        end_min = start_min + occ
        slots = busy.setdefault((s.id, day), [])
        if any(start_min < e and end_min > b for b, e in slots):
            continue
        start_dt = datetime.combine(day, time(start_min // 60, start_min % 60))
        if start_dt < now:
            status = rng.choices([AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED],
                                 weights=[74, 8, 18])[0]
        else:
            status = AppointmentStatus.CONFIRMED
        if status != AppointmentStatus.CANCELLED:
            slots.append((start_min, end_min))
        db.add(Appointment(
            tenant_id=tid, customer_id=rng.choice(customers).id, staff_id=s.id, service_id=v.id,
            appointment_date=day, appointment_time=start_dt.time(), status=status,
            payment_method=rng.choice(pay_names) if status == AppointmentStatus.COMPLETED else None,
        ))
        placed += 1
    await db.flush()
    return f"{slug}: {len(bookable)} personel, {len(services)} hizmet, {len(customers)} sahte müşteri, {placed} sahte randevu"


async def main(reset_only: bool) -> None:
    if settings.environment != "development":
        raise SystemExit("Yalnızca ENVIRONMENT=development iken çalışır.")
    password_hash = hash_password(PASSWORD)
    async with SessionFactory() as db:
        for slug in SHOPS:
            if reset_only:
                tenant = (await db.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none()
                if tenant is not None:
                    print(f"{slug}: {await reset_mock(db, tenant.id)} sahte müşteri (ve randevuları) silindi")
            else:
                print(await seed_shop(db, slug, password_hash))
        await db.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main("--reset" in sys.argv))
