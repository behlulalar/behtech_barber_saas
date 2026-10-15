"""Test verisi üreticileri (doğrudan DB'ye yazar; bcrypt maliyetini azaltmak için hash tek sefer hesaplanır)."""
from dataclasses import dataclass, field
from datetime import date, time
from functools import lru_cache

from app.core.database import SessionFactory
from app.core.security import hash_password
from app.models.customer import Customers
from app.models.payment_method import PaymentMethod
from app.models.platform_admin import PlatformAdmin
from app.models.service import Service
from app.models.staff import RoleType, Staff
from app.models.staff_service import StaffService
from app.models.tenant import Tenant
from app.models.tenant_settings import TenantSettings
from app.models.working_hours import WorkingHours
from app.models.appointment import Appointment, AppointmentStatus

PASSWORD = "secret123"
OWNER_PHONE = "5551110001"
STAFF_PHONE = "5551110002"
STAFF2_PHONE = "5551110003"
PLATFORM_PHONE = "5000000001"
PLATFORM_PASSWORD = "platform-pass-1"


@lru_cache(maxsize=None)
def pw_hash(password: str = PASSWORD) -> str:
    return hash_password(password)


@dataclass
class Shop:
    tenant: Tenant
    owner: Staff
    staff: Staff  # normal personel
    staff2: Staff  # ikinci personel (meslektaş)
    cut: Service  # 30 dk
    cut_beard: Service  # 60 dk
    slug: str = ""
    owner_token: str = ""
    staff_token: str = ""
    staff2_token: str = ""


async def make_tenant(slug: str, name: str | None = None, active: bool = True) -> Tenant:
    async with SessionFactory() as db:
        t = Tenant(name=name or slug.title(), slug=slug, is_active=active)
        db.add(t)
        await db.flush()
        db.add(TenantSettings(tenant_id=t.id, business_name=t.name, business_adress="Adres 1"))
        await db.commit()
        return t


async def make_staff(tenant_id, name, surname, phone, role=RoleType.STAFF, password=PASSWORD) -> Staff:
    async with SessionFactory() as db:
        s = Staff(tenant_id=tenant_id, name=name, surname=surname, phone=phone, password=pw_hash(password), role=role)
        db.add(s)
        await db.commit()
        return s


async def make_service(tenant_id, name, duration_min=30, price=100, active=True) -> Service:
    async with SessionFactory() as db:
        s = Service(tenant_id=tenant_id, name=name, duration_min=duration_min, price=price, is_active=active)
        db.add(s)
        await db.commit()
        return s


async def link_staff_service(tenant_id, staff_id, service_id) -> None:
    async with SessionFactory() as db:
        db.add(StaffService(tenant_id=tenant_id, staff_id=staff_id, service_id=service_id))
        await db.commit()


async def set_working_hours(tenant_id, staff_id, start=time(9, 0), end=time(18, 0), days=range(7)) -> None:
    """day_of_week JS kuralı (0=Pazar): varsayılan her gün açık."""
    async with SessionFactory() as db:
        for d in days:
            db.add(WorkingHours(tenant_id=tenant_id, staff_id=staff_id, day_of_week=d, start_time=start, end_time=end))
        await db.commit()


async def make_customer(tenant_id, phone, name="Ali", surname="Veli") -> Customers:
    async with SessionFactory() as db:
        c = Customers(tenant_id=tenant_id, phone=phone, name=name, surname=surname)
        db.add(c)
        await db.commit()
        return c


async def make_appointment(tenant_id, customer_id, staff_id, service_id, day: date, at: time,
                           status=AppointmentStatus.CONFIRMED) -> Appointment:
    async with SessionFactory() as db:
        a = Appointment(tenant_id=tenant_id, customer_id=customer_id, staff_id=staff_id, service_id=service_id,
                        appointment_date=day, appointment_time=at, status=status)
        db.add(a)
        await db.commit()
        return a


async def make_payment_method(tenant_id, name="Havale", details=None) -> PaymentMethod:
    async with SessionFactory() as db:
        p = PaymentMethod(tenant_id=tenant_id, name=name, details=details or {"iban": "TR000000000000000000000000"})
        db.add(p)
        await db.commit()
        return p


async def make_platform_admin(phone=PLATFORM_PHONE, password=PLATFORM_PASSWORD) -> PlatformAdmin:
    async with SessionFactory() as db:
        a = PlatformAdmin(phone=phone, password=pw_hash(password))
        db.add(a)
        await db.commit()
        return a


async def make_shop(slug: str, hours=True, phone_offset: int = 0) -> Shop:
    """Tenant + ayarlar + sahip + 2 personel + 2 hizmet (30/60 dk) + staff_services + her gün 09-18 çalışma saati."""
    from tests.helpers import mint_staff_token

    off = phone_offset
    t = await make_tenant(slug)
    owner = await make_staff(t.id, "Sahip", "Patron", f"55511{10001 + off}", RoleType.SUPER_ADMIN)
    staff = await make_staff(t.id, "Berber", "Bir", f"55511{10002 + off}")
    staff2 = await make_staff(t.id, "Berber", "Iki", f"55511{10003 + off}")
    cut = await make_service(t.id, "Saç Kesimi", 30, 200)
    cut_beard = await make_service(t.id, "Saç Sakal", 60, 350)
    for st in (owner, staff, staff2):
        for sv in (cut, cut_beard):
            await link_staff_service(t.id, st.id, sv.id)
        if hours:
            await set_working_hours(t.id, st.id)
    return Shop(
        tenant=t, owner=owner, staff=staff, staff2=staff2, cut=cut, cut_beard=cut_beard, slug=slug,
        owner_token=mint_staff_token(owner), staff_token=mint_staff_token(staff), staff2_token=mint_staff_token(staff2),
    )
