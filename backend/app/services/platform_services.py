import re

from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.appointment import Appointment
from app.models.platform_admin import PlatformAdmin
from app.models.staff import RoleType, Staff
from app.models.tenant import Tenant
from app.models.tenant_settings import TenantSettings
from app.schemas.platform import TenantCreate
from app.schemas.tenant import TenantOut
from app.services.audit_services import audit

RESERVED_SLUGS = {"www", "api", "admin", "platform", "app", "mail", "saleshub", "panel", "static", "randevu"}
SLUG_RE = re.compile(r"^[a-z0-9-]{3,40}$")


def validate_slug(slug: str) -> None:
    if not SLUG_RE.match(slug) or slug.startswith("-") or slug.endswith("-"):
        raise HTTPException(
            status_code=400,
            detail="Adres 3-40 karakter olmalı; sadece küçük harf, rakam ve tire içerebilir, tire ile başlayıp bitemez",
        )
    if slug in RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail="Bu adres rezerve edilmiştir, başka bir adres seçin")


def _tenant_out_query():
    staff_count = (
        select(func.count(Staff.id)).where(Staff.tenant_id == Tenant.id).correlate(Tenant).scalar_subquery()
    )
    appointment_count = (
        select(func.count(Appointment.id)).where(Appointment.tenant_id == Tenant.id).correlate(Tenant).scalar_subquery()
    )
    # Sahip: işletmenin ilk eklenen super_admin'i (birden fazla olabilir).
    owner = (
        select(Staff.id)
        .where(Staff.tenant_id == Tenant.id, Staff.role == RoleType.SUPER_ADMIN)
        .order_by(Staff.id)
        .limit(1)
        .correlate(Tenant)
        .scalar_subquery()
    )
    return (
        select(
            Tenant,
            staff_count.label("staff_count"),
            appointment_count.label("appointment_count"),
            Staff.name.label("owner_name"),
            Staff.surname.label("owner_surname"),
            Staff.phone.label("owner_phone"),
        )
        .outerjoin(Staff, Staff.id == owner)
    )


def _row_to_out(row) -> TenantOut:
    tenant, staff_count, appointment_count, owner_name, owner_surname, owner_phone = row
    return TenantOut(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
        staff_count=staff_count,
        appointment_count=appointment_count,
        owner_name=" ".join(p for p in (owner_name, owner_surname) if p) or None,
        owner_phone=owner_phone,
    )


async def list_tenants(db: Session) -> list[TenantOut]:
    rows = (await db.execute(_tenant_out_query().order_by(Tenant.id))).all()
    return [_row_to_out(r) for r in rows]


async def get_tenant_out(db: Session, tenant_id: int) -> TenantOut:
    row = (await db.execute(_tenant_out_query().where(Tenant.id == tenant_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return _row_to_out(row)


async def create_tenant(
    db: Session, data: TenantCreate, actor: PlatformAdmin | None = None, request: Request | None = None
) -> TenantOut:
    validate_slug(data.slug)
    taken = await db.execute(select(Tenant.id).where(Tenant.slug == data.slug))
    if taken.first() is not None:
        raise HTTPException(status_code=409, detail="Bu adres zaten kullanılıyor")

    # Tenant + ayarlar + sahip tek transaction: biri patlarsa hiçbiri kalmaz.
    try:
        tenant = Tenant(name=data.name.strip(), slug=data.slug)
        db.add(tenant)
        await db.flush()
        db.add(TenantSettings(tenant_id=tenant.id, business_name=tenant.name, business_adress=""))
        db.add(
            Staff(
                tenant_id=tenant.id,
                name=data.owner_name.strip(),
                surname=data.owner_surname.strip(),
                phone=data.owner_phone,
                password=hash_password(data.owner_password),
                role=RoleType.SUPER_ADMIN,
            )
        )
        await audit(db, actor=actor, request=request, action="tenant.create", entity_type="tenant",
                    entity_id=tenant.id, tenant_id=tenant.id, summary=f"'{tenant.name}' işletmesi oluşturuldu",
                    details={"slug": tenant.slug, "owner_phone": data.owner_phone})
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu adres zaten kullanılıyor")
    return await get_tenant_out(db, tenant.id)


async def update_tenant(
    db: Session, tenant_id: int, name: str | None, is_active: bool | None,
    actor: PlatformAdmin | None = None, request: Request | None = None,
) -> TenantOut:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    if name is not None and name.strip() != tenant.name:
        old = tenant.name
        tenant.name = name.strip()
        await audit(db, actor=actor, request=request, action="tenant.rename", entity_type="tenant",
                    entity_id=tenant.id, tenant_id=tenant.id,
                    summary=f"İşletme adı '{old}' iken '{tenant.name}' yapıldı", details={"from": old, "to": tenant.name})
    if is_active is not None:
        if is_active != tenant.is_active:
            verb, action = ("aktifleştirildi", "tenant.activate") if is_active else ("devre dışı bırakıldı", "tenant.deactivate")
            await audit(db, actor=actor, request=request, action=action, entity_type="tenant",
                        entity_id=tenant.id, tenant_id=tenant.id, summary=f"'{tenant.name}' işletmesi {verb}")
        tenant.is_active = is_active
        if is_active:
            tenant.auto_suspended_at = None
    await db.commit()
    return await get_tenant_out(db, tenant_id)
