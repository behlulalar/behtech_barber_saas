"""Platform yöneticileri: ekleme, güncelleme, şifre, silme. Her işlem audit'lenir (aynı transaction)."""
from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.password_policy import enforce_password_policy
from app.core.security import hash_password
from app.models.platform_admin import PlatformAdmin
from app.schemas.platform import PlatformAdminCreate, PlatformAdminOut, PlatformAdminUpdate
from app.services.audit_services import audit

DUP_MSG = "Bu telefon numarası zaten kayıtlı"


def admin_out(a: PlatformAdmin, me_id: int) -> PlatformAdminOut:
    return PlatformAdminOut(
        id=a.id, phone=a.phone, name=a.name, is_active=a.is_active, last_login_at=a.last_login_at,
        created_at=a.created_at, is_me=a.id == me_id, totp_enabled=a.totp_enabled,
    )


def label(a: PlatformAdmin) -> str:
    return f"{a.name} ({a.phone})" if a.name else a.phone


async def _get(db: AsyncSession, admin_id: int) -> PlatformAdmin:
    a = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == admin_id))).scalar_one_or_none()
    if a is None:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    return a


async def _active_count(db: AsyncSession) -> int:
    return (await db.execute(
        select(func.count(PlatformAdmin.id)).where(PlatformAdmin.is_active == True)  # noqa: E712
    )).scalar_one()


async def list_admins(db: AsyncSession, me: PlatformAdmin) -> list[PlatformAdminOut]:
    rows = (await db.execute(select(PlatformAdmin).order_by(PlatformAdmin.id))).scalars().all()
    return [admin_out(a, me.id) for a in rows]


async def create_admin(
    db: AsyncSession, me: PlatformAdmin, data: PlatformAdminCreate, request: Request
) -> PlatformAdminOut:
    enforce_password_policy(data.password, data.phone)
    admin = PlatformAdmin(
        phone=data.phone, name=(data.name or "").strip() or None, password=hash_password(data.password)
    )
    db.add(admin)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=DUP_MSG)
    await audit(db, actor=me, request=request, action="admin.create", entity_type="platform_admin",
                entity_id=admin.id, summary=f"Yönetici eklendi: {label(admin)}",
                details={"phone": admin.phone, "name": admin.name})
    await db.commit()
    await db.refresh(admin)
    return admin_out(admin, me.id)


async def update_admin(
    db: AsyncSession, me: PlatformAdmin, admin_id: int, data: PlatformAdminUpdate, request: Request
) -> PlatformAdminOut:
    target = await _get(db, admin_id)
    fields = data.model_dump(exclude_unset=True)
    changed: list[str] = []
    if "name" in fields:
        new_name = (fields["name"] or "").strip() or None
        if new_name != target.name:
            target.name = new_name
            changed.append("name")
    if fields.get("phone") is not None and fields["phone"] != target.phone:
        taken = await db.execute(select(PlatformAdmin.id).where(PlatformAdmin.phone == fields["phone"], PlatformAdmin.id != target.id))
        if taken.first() is not None:
            raise HTTPException(status_code=409, detail=DUP_MSG)
        target.phone = fields["phone"]
        if target.id != me.id:
            target.token_version += 1
        changed.append("phone")
    if fields.get("is_active") is not None and fields["is_active"] != target.is_active:
        if not fields["is_active"]:
            if target.id == me.id:
                raise HTTPException(status_code=400, detail="Kendi hesabınızı pasife alamazsınız")
            if target.is_active and await _active_count(db) <= 1:
                raise HTTPException(status_code=400, detail="Son aktif yöneticiyi pasife alamazsınız")
            # Pasife alınan yöneticinin açık oturumları da düşsün.
            target.token_version += 1
        target.is_active = fields["is_active"]
        changed.append("is_active")
    if changed:
        await audit(db, actor=me, request=request, action="admin.update", entity_type="platform_admin",
                    entity_id=target.id, summary=f"Yönetici güncellendi: {label(target)}",
                    details={"changed_fields": changed, "is_active": target.is_active})
    await db.commit()
    return admin_out(target, me.id)


async def reset_password(db: AsyncSession, me: PlatformAdmin, admin_id: int, password: str, request: Request) -> None:
    target = await _get(db, admin_id)
    enforce_password_policy(password, target.phone)
    target.password = hash_password(password)
    target.token_version += 1
    await audit(db, actor=me, request=request, action="admin.password_reset", entity_type="platform_admin",
                entity_id=target.id, summary=f"Yönetici şifresi sıfırlandı: {label(target)}")
    await db.commit()


async def delete_admin(db: AsyncSession, me: PlatformAdmin, admin_id: int, request: Request) -> None:
    target = await _get(db, admin_id)
    if target.id == me.id:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")
    if target.is_active and await _active_count(db) <= 1:
        raise HTTPException(status_code=400, detail="Son aktif yöneticiyi silemezsiniz")
    await audit(db, actor=me, request=request, action="admin.delete", entity_type="platform_admin",
                entity_id=target.id, summary=f"Yönetici silindi: {label(target)}",
                details={"phone": target.phone, "name": target.name})
    await db.delete(target)
    await db.commit()
