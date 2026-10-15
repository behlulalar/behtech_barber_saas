import re

from fastapi import HTTPException, Request
import secrets

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.appointment import Appointment
from app.models.platform_admin import PlatformAdmin
from app.models.staff import RoleType, Staff
from app.models.tenant import Tenant
from app.models.service import Service
from app.models.staff_service import StaffService
from app.models.tenant_settings import TenantSettings
from app.models.working_hours import WorkingHours
from app.schemas.platform import OwnerUpdate, TenantCreate
from app.schemas.tenant import (
    OwnerOut, SetupCheck, SetupOut, TenantDetailOut, TenantOption, TenantOut, TenantPage,
)
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
        select(func.count(Staff.id)).where(Staff.tenant_id == Tenant.id, Staff.is_active == True).correlate(Tenant).scalar_subquery()  # noqa: E712
    )
    appointment_count = (
        select(func.count(Appointment.id)).where(Appointment.tenant_id == Tenant.id).correlate(Tenant).scalar_subquery()
    )
    # Sahip: işletmenin ilk eklenen super_admin'i (birden fazla olabilir).
    owner = (
        select(Staff.id)
        .where(Staff.tenant_id == Tenant.id, Staff.role == RoleType.SUPER_ADMIN, Staff.is_active == True)  # noqa: E712
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


def _row_to_out(row, setup: SetupOut | None = None) -> TenantOut:
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
        auto_suspended=tenant.auto_suspended_at is not None,
        note=tenant.note,
        setup=setup,
    )


SETUP_CHECKS = (
    ("services", "En az bir aktif hizmet", "İşletme panelinde Hizmetler'den ekleyin"),
    ("staff", "En az bir berber", "İşletme panelinde Personel'den berber ekleyin"),
    ("working_hours", "Her berberin çalışma saati var", "Personel'de her berber için çalışma saati tanımlayın"),
    ("staff_services", "Her berber en az bir hizmet veriyor", "Personel'de her berbere en az bir hizmet atayın"),
    ("address", "Adres girilmiş", "Ayarlar'dan işletme adresini girin"),
    ("first_appointment", "İlk randevu alınmış", "Henüz randevu alınmadı"),
)
_BLOCKING = {"services", "staff", "working_hours", "staff_services"}  # müşterinin randevu alabilmesini belirler


async def _setup_for(db: Session, tenant_ids: list[int]) -> dict[int, SetupOut]:
    """Sayfadaki işletmelerin kurulum durumu: kontrol başına tek gruplu sorgu (N+1 yok)."""
    if not tenant_ids:
        return {}
    in_t = lambda col: col.in_(tenant_ids)  # noqa: E731
    barber = (Staff.role != RoleType.TECHNICAL_SUPPORT) & (Staff.is_active == True)  # noqa: E712

    async def grouped(stmt) -> dict[int, int]:
        return {tid: n for tid, n in (await db.execute(stmt)).all()}

    services = await grouped(
        select(Service.tenant_id, func.count(Service.id))
        .where(in_t(Service.tenant_id), Service.is_active == True).group_by(Service.tenant_id)  # noqa: E712
    )
    barbers = await grouped(
        select(Staff.tenant_id, func.count(Staff.id)).where(in_t(Staff.tenant_id), barber).group_by(Staff.tenant_id)
    )
    no_hours = await grouped(
        select(Staff.tenant_id, func.count(Staff.id))
        .where(in_t(Staff.tenant_id), barber, ~select(WorkingHours.id).where(WorkingHours.staff_id == Staff.id).exists())
        .group_by(Staff.tenant_id)
    )
    no_services = await grouped(
        select(Staff.tenant_id, func.count(Staff.id))
        .where(
            in_t(Staff.tenant_id), barber,
            ~select(StaffService.id)
            .join(Service, Service.id == StaffService.service_id)
            .where(StaffService.staff_id == Staff.id, Service.is_active == True)  # noqa: E712
            .exists(),
        )
        .group_by(Staff.tenant_id)
    )
    addressed = set(
        (await db.execute(
            select(TenantSettings.tenant_id)
            .where(in_t(TenantSettings.tenant_id), func.length(func.trim(TenantSettings.business_adress)) > 0)
        )).scalars()
    )
    with_appt = set(
        (await db.execute(select(Appointment.tenant_id).where(in_t(Appointment.tenant_id)).distinct())).scalars()
    )

    out: dict[int, SetupOut] = {}
    for tid in tenant_ids:
        ok = {
            "services": services.get(tid, 0) > 0,
            "staff": barbers.get(tid, 0) > 0,
            "working_hours": barbers.get(tid, 0) > 0 and no_hours.get(tid, 0) == 0,
            "staff_services": barbers.get(tid, 0) > 0 and no_services.get(tid, 0) == 0,
            "address": tid in addressed,
            "first_appointment": tid in with_appt,
        }
        checks = [SetupCheck(key=k, label=label, ok=ok[k], hint=hint) for k, label, hint in SETUP_CHECKS]
        out[tid] = SetupOut(
            ready=all(ok[k] for k in _BLOCKING),
            missing_count=sum(1 for c in checks if not c.ok),
            checks=checks,
        )
    return out


def _like_escape(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_tenants(
    db: Session, *, search: str | None = None, status: str = "all", sort: str = "-created",
    limit: int = 25, offset: int = 0,
) -> TenantPage:
    q = _tenant_out_query()
    term = (search or "").strip()
    if term:
        pat = f"%{_like_escape(term)}%"
        q = q.where(or_(
            Tenant.name.ilike(pat, escape="\\"),
            Tenant.slug.ilike(pat, escape="\\"),
            func.concat(Staff.name, " ", Staff.surname).ilike(pat, escape="\\"),
            Staff.phone.ilike(pat, escape="\\"),
        ))
    if status == "active":
        q = q.where(Tenant.is_active == True)  # noqa: E712
    elif status == "inactive":
        q = q.where(Tenant.is_active == False)  # noqa: E712
    elif status == "suspended":
        q = q.where(Tenant.auto_suspended_at.is_not(None))

    total = (await db.execute(select(func.count()).select_from(q.order_by(None).subquery()))).scalar_one()

    desc = sort.startswith("-")
    key = sort.lstrip("-")
    col = {
        "name": func.lower(Tenant.name), "created": Tenant.created_at,
        "staff": q.selected_columns.staff_count, "appointments": q.selected_columns.appointment_count,
    }[key]
    q = q.order_by(col.desc() if desc else col.asc(), Tenant.id.desc() if desc else Tenant.id.asc())
    rows = (await db.execute(q.limit(limit).offset(offset))).all()
    setups = await _setup_for(db, [r[0].id for r in rows])
    return TenantPage(items=[_row_to_out(r, setups[r[0].id]) for r in rows], total=total, limit=limit, offset=offset)


async def list_options(db: Session) -> list[TenantOption]:
    rows = (await db.execute(select(Tenant.id, Tenant.name, Tenant.slug).order_by(func.lower(Tenant.name), Tenant.id))).all()
    return [TenantOption(id=i, name=n, slug=sl) for i, n, sl in rows]


async def _owner(db: Session, tenant_id: int) -> Staff | None:
    return (await db.execute(
        select(Staff).where(Staff.tenant_id == tenant_id, Staff.role == RoleType.SUPER_ADMIN, Staff.is_active == True).order_by(Staff.id).limit(1)  # noqa: E712
    )).scalar_one_or_none()


async def get_tenant_out(db: Session, tenant_id: int) -> TenantOut:
    row = (await db.execute(_tenant_out_query().where(Tenant.id == tenant_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return _row_to_out(row, (await _setup_for(db, [tenant_id]))[tenant_id])


async def get_tenant_detail(db: Session, tenant_id: int) -> TenantDetailOut:
    out = await get_tenant_out(db, tenant_id)
    owner = await _owner(db, tenant_id)
    return TenantDetailOut(
        **out.model_dump(exclude={"setup"}), setup=out.setup,
        owner=OwnerOut(id=owner.id, name=owner.name, surname=owner.surname, phone=owner.phone) if owner else None,
    )


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
        if data.start_trial:
            from app.services import billing_services  # döngüsel import'u önlemek için yerelde
            await billing_services.add_trial(db, tenant, data.trial_days, None, actor, request)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu adres zaten kullanılıyor")
    return await get_tenant_out(db, tenant.id)


async def update_tenant(
    db: Session, tenant_id: int, name: str | None, is_active: bool | None, note: str | None = None,
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
    if note is not None:
        new_note = note.strip() or None
        if new_note != tenant.note:
            tenant.note = new_note
            # Not metni log'a yazılmaz (iç not, hassas olabilir): yalnızca değiştiği kaydedilir.
            await audit(db, actor=actor, request=request, action="tenant.note_update", entity_type="tenant",
                        entity_id=tenant.id, tenant_id=tenant.id, summary=f"'{tenant.name}' işletme notu değişti",
                        details={"changed": True})
    await db.commit()
    return await get_tenant_out(db, tenant_id)


_PW_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 0/O/1/l/I yok


async def update_owner(
    db: Session, tenant_id: int, data: OwnerUpdate, actor: PlatformAdmin | None, request: Request | None
) -> TenantDetailOut:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    owner = await _owner(db, tenant_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="İşletme sahibi bulunamadı")
    changed: list[str] = []
    details: dict = {}
    if data.name is not None and data.name != owner.name:
        owner.name = data.name
        changed.append("name")
    if data.surname is not None and data.surname != owner.surname:
        owner.surname = data.surname
        changed.append("surname")
    if data.phone is not None and data.phone != owner.phone:
        dup = await db.execute(
            select(Staff.id).where(Staff.tenant_id == tenant_id, Staff.phone == data.phone, Staff.id != owner.id)
        )
        if dup.first() is not None:
            raise HTTPException(status_code=409, detail="Bu telefon numarası zaten kayıtlı")
        details["phone"] = {"from": owner.phone, "to": data.phone}  # telefon giriş kimliğidir
        owner.phone = data.phone
        owner.token_version += 1  # giriş kimliği değişti: eski oturumlar düşer
        changed.append("phone")
    if changed:
        details["fields"] = changed
        await audit(db, actor=actor, request=request, action="tenant.owner_update", entity_type="staff",
                    entity_id=owner.id, tenant_id=tenant_id,
                    summary=f"'{tenant.name}' işletme sahibi bilgisi değişti ({', '.join(changed)})", details=details)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Bu telefon numarası zaten kayıtlı")
    return await get_tenant_detail(db, tenant_id)


async def reset_owner_password(
    db: Session, tenant_id: int, password: str | None, actor: PlatformAdmin | None, request: Request | None
) -> str:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    owner = await _owner(db, tenant_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="İşletme sahibi bulunamadı")
    plain = password or "".join(secrets.choice(_PW_ALPHABET) for _ in range(10))
    owner.password = hash_password(plain)
    owner.token_version += 1  # açık oturumlar düşer
    await audit(db, actor=actor, request=request, action="tenant.owner_password_reset", entity_type="staff",
                entity_id=owner.id, tenant_id=tenant_id,
                summary=f"'{tenant.name}' işletme sahibinin şifresi sıfırlandı",
                details={"generated": password is None})  # şifrenin kendisi asla yazılmaz
    await db.commit()
    return plain
