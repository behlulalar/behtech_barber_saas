"""Idempotent dev seed: (re)creates the `demo` tenant with realistic Turkish barbershop data.

Usage: .venv/bin/python scripts/seed_demo.py

Deletes tenant slug `demo` (FK cascade removes all its rows) and rebuilds it, then ensures
the platform admin 5000000000 / platform1234 exists. Never touches any other tenant.
"""
import asyncio
import random
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.database import SessionFactory, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.appointment import Appointment, AppointmentStatus  # noqa: E402
from app.models.customer import Customers  # noqa: E402
from app.models.payment_method import PaymentMethod  # noqa: E402
from app.models.platform_admin import PlatformAdmin  # noqa: E402
from app.models.service import Service  # noqa: E402
from app.models.staff import RoleType, Staff  # noqa: E402
from app.models.staff_service import StaffService  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402
from app.models.tenant_settings import TenantSettings  # noqa: E402
from app.models.working_hours import WorkingHours  # noqa: E402
from app.services.appointment_services import _js_day_of_week  # noqa: E402

SLUG = "demo"
SEED = 20260101
WORK_START, WORK_END = time(9, 0), time(20, 0)

STAFF = [
    ("5550000001", "Kerem", "Yıldız", RoleType.SUPER_ADMIN),
    ("5550000002", "Burak", "Aydın", RoleType.STAFF),
    ("5550000003", "Emir", "Kaya", RoleType.STAFF),
]
SERVICES = [
    ("Saç Kesimi", 450, 60),
    ("Sakal", 250, 30),
    ("Saç + Sakal", 650, 60),
    ("Çocuk Kesimi", 300, 30),
    ("Cilt Bakımı", 500, 60),
    ("Keratin", 1500, 90),
]
CUSTOMERS = [
    ("Ahmet", "Demir"), ("Mehmet", "Çelik"), ("Mustafa", "Şahin"), ("Ali", "Öztürk"),
    ("Hüseyin", "Arslan"), ("İbrahim", "Doğan"), ("Yusuf", "Kılıç"), ("Murat", "Aksoy"),
    ("Can", "Erdem"), ("Cem", "Tunç"), ("Oğuz", "Polat"), ("Serkan", "Korkmaz"),
]


def minutes(t: time) -> int:
    return t.hour * 60 + t.minute


async def seed() -> None:
    rng = random.Random(SEED)
    now = datetime.now()
    today = now.date()

    async with SessionFactory() as db:
        await db.execute(delete(Tenant).where(Tenant.slug == SLUG))
        await db.commit()

        tenant = Tenant(name="Demo Berber", slug=SLUG, is_active=True)
        db.add(tenant)
        await db.flush()

        db.add(TenantSettings(
            tenant_id=tenant.id,
            business_name="Demo Berber",
            business_adress="Bağdat Caddesi No: 112, Kadıköy / İstanbul",
            notification_banner_enabled=False,
        ))

        staff_rows: list[Staff] = []
        for phone, name, surname, role in STAFF:
            s = Staff(tenant_id=tenant.id, name=name, surname=surname, phone=phone,
                      password=hash_password("demo1234"), role=role)
            db.add(s)
            staff_rows.append(s)

        service_rows: list[Service] = []
        for name, price, duration in SERVICES:
            sv = Service(tenant_id=tenant.id, name=name, price=price, duration_min=duration, is_active=True)
            db.add(sv)
            service_rows.append(sv)

        for name in ("Nakit", "Kart"):
            db.add(PaymentMethod(tenant_id=tenant.id, name=name, is_active=True))

        customer_rows: list[Customers] = []
        for i, (name, surname) in enumerate(CUSTOMERS):
            c = Customers(tenant_id=tenant.id, name=name, surname=surname, phone=f"55{5100000 + i * 7919:08d}"[:10])
            db.add(c)
            customer_rows.append(c)
        await db.flush()

        # Varsayılan: her berber her hizmeti verir (panelden daraltılabilir).
        for s in staff_rows:
            if s.role != RoleType.TECHNICAL_SUPPORT:
                for sv in service_rows:
                    db.add(StaffService(tenant_id=tenant.id, staff_id=s.id, service_id=sv.id))

        # Pazartesi-Cumartesi (JS günleri 1..6) 09:00-20:00, Pazar kapalı.
        for s in staff_rows:
            for day in range(1, 7):
                db.add(WorkingHours(tenant_id=tenant.id, staff_id=s.id, day_of_week=day,
                                    start_time=WORK_START, end_time=WORK_END))

        # --- randevular: son 14 / önümüzdeki 14 gün, çakışma yok, çalışma saatleri içinde
        days = [today + timedelta(days=d) for d in range(-14, 15)]
        working_days = [d for d in days if 1 <= _js_day_of_week(d) <= 6]
        occupied: dict[tuple[int, date], list[tuple[int, int]]] = {}
        placed = 0
        attempts = 0
        target = 42
        while placed < target and attempts < 5000:
            attempts += 1
            day = rng.choice(working_days)
            staff = rng.choice(staff_rows)
            service = rng.choice(service_rows)
            occ = -(-service.duration_min // 30) * 30  # ceil(süre/30) slot
            first = -(-minutes(WORK_START) // 30) * 30
            start_min = first + 30 * rng.randrange(0, (minutes(WORK_END) - occ - first) // 30 + 1)
            end_min = start_min + occ
            busy = occupied.setdefault((staff.id, day), [])
            if any(start_min < be and end_min > bs for bs, be in busy):
                continue
            start_dt = datetime.combine(day, time(start_min // 60, start_min % 60))

            if start_dt < now:
                status = rng.choices(
                    [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED],
                    weights=[72, 10, 18])[0]
            else:
                status = AppointmentStatus.CONFIRMED

            busy.append((start_min, end_min))
            db.add(Appointment(
                tenant_id=tenant.id,
                customer_id=rng.choice(customer_rows).id,
                staff_id=staff.id,
                service_id=service.id,
                price=service.price,
                appointment_date=day,
                appointment_time=start_dt.time(),
                status=status,
                payment_method=rng.choice(["Nakit", "Kart"]) if status == AppointmentStatus.COMPLETED else None,
            ))
            placed += 1

        # --- platform admin (yoksa oluştur)
        existing = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.phone == "5000000000"))).scalar_one_or_none()
        if existing is None:
            db.add(PlatformAdmin(phone="5000000000", password=hash_password("platform1234")))

        await db.commit()
        print(f"Seeded tenant '{SLUG}' (id={tenant.id}): {len(staff_rows)} staff, {len(service_rows)} services, "
              f"{len(customer_rows)} customers, {placed} appointments.")
        print("Owner 5550000001/demo1234 | Platform admin 5000000000/platform1234")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
