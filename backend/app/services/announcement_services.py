"""Platformdan işletme panellerine duyuru (banner)."""
from datetime import date

from fastapi import HTTPException, Request
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import Announcement, AnnouncementTarget
from app.models.platform_admin import PlatformAdmin
from app.models.tenant import Tenant
from app.schemas.announcement import AnnouncementIn, AnnouncementOut, AnnouncementPublic, AnnouncementUpdate
from app.services.audit_services import audit


def _status(a: Announcement, today: date) -> str:
    if a.starts_on > today:
        return "scheduled"
    if a.ends_on is not None and a.ends_on < today:
        return "ended"
    return "active"


async def _targets(db: AsyncSession, ids: list[int]) -> dict[int, list[int]]:
    out: dict[int, list[int]] = {i: [] for i in ids}
    if not ids:
        return out
    rows = (await db.execute(select(AnnouncementTarget).where(AnnouncementTarget.announcement_id.in_(ids)))).scalars().all()
    for r in rows:
        out[r.announcement_id].append(r.tenant_id)
    return out


def _out(a: Announcement, targets: list[int]) -> AnnouncementOut:
    return AnnouncementOut(
        id=a.id, title=a.title, body=a.body, level=a.level, target_all=a.target_all, tenant_ids=sorted(targets),
        starts_on=a.starts_on, ends_on=a.ends_on, status=_status(a, date.today()), created_at=a.created_at,
    )


async def _validate_tenants(db: AsyncSession, ids: list[int]) -> list[int]:
    ids = sorted(set(ids))
    if ids:
        found = set((await db.execute(select(Tenant.id).where(Tenant.id.in_(ids)))).scalars().all())
        if found != set(ids):
            raise HTTPException(status_code=400, detail="Seçilen işletmelerden biri bulunamadı")
    return ids


async def list_all(db: AsyncSession) -> list[AnnouncementOut]:
    rows = (await db.execute(select(Announcement).order_by(Announcement.id.desc()))).scalars().all()
    targets = await _targets(db, [a.id for a in rows])
    return [_out(a, targets[a.id]) for a in rows]


async def create(db: AsyncSession, data: AnnouncementIn, actor: PlatformAdmin, request: Request) -> AnnouncementOut:
    ids = await _validate_tenants(db, data.tenant_ids) if not data.target_all else []
    a = Announcement(
        title=data.title.strip(), body=data.body.strip(), level=data.level, target_all=data.target_all,
        starts_on=data.starts_on or date.today(), ends_on=data.ends_on,
    )
    db.add(a)
    await db.flush()
    db.add_all([AnnouncementTarget(announcement_id=a.id, tenant_id=t) for t in ids])
    await audit(db, actor=actor, request=request, action="announcement.create", entity_type="announcement",
                entity_id=a.id, tenant_id=None, summary=f"Duyuru yayınlandı: '{a.title}'",
                details={"target_all": a.target_all, "tenant_count": len(ids), "level": a.level})
    await db.commit()
    return _out(a, ids)


async def _get(db: AsyncSession, announcement_id: int) -> Announcement:
    a = (await db.execute(select(Announcement).where(Announcement.id == announcement_id))).scalar_one_or_none()
    if a is None:
        raise HTTPException(status_code=404, detail="Duyuru bulunamadı")
    return a


async def update(db: AsyncSession, announcement_id: int, data: AnnouncementUpdate, actor: PlatformAdmin, request: Request) -> AnnouncementOut:
    a = await _get(db, announcement_id)
    fields = data.model_dump(exclude_unset=True)
    for key in ("title", "body"):
        if fields.get(key) is not None:
            setattr(a, key, fields[key].strip())
    if fields.get("level") is not None:
        a.level = fields["level"]
    if fields.get("starts_on") is not None:
        a.starts_on = fields["starts_on"]
    if data.clear_ends_on:
        a.ends_on = None
    elif fields.get("ends_on") is not None:
        a.ends_on = fields["ends_on"]
    if a.ends_on is not None and a.ends_on < a.starts_on:
        raise HTTPException(status_code=400, detail="Bitiş tarihi başlangıçtan önce olamaz")
    target_all = fields["target_all"] if fields.get("target_all") is not None else a.target_all
    if fields.get("tenant_ids") is not None or target_all != a.target_all:
        current = (await _targets(db, [a.id]))[a.id]
        ids = await _validate_tenants(db, fields["tenant_ids"] if fields.get("tenant_ids") is not None else current) if not target_all else []
        if not target_all and not ids:
            raise HTTPException(status_code=422, detail="Seçili işletmelere gönderim için en az bir işletme seçin")
        await db.execute(delete(AnnouncementTarget).where(AnnouncementTarget.announcement_id == a.id))
        db.add_all([AnnouncementTarget(announcement_id=a.id, tenant_id=t) for t in ids])
        a.target_all = target_all
    await audit(db, actor=actor, request=request, action="announcement.update", entity_type="announcement",
                entity_id=a.id, tenant_id=None, summary=f"Duyuru güncellendi: '{a.title}'",
                details={"changed_fields": sorted(k for k in fields if k != "body")})
    await db.commit()
    return _out(a, (await _targets(db, [a.id]))[a.id])


async def delete_one(db: AsyncSession, announcement_id: int, actor: PlatformAdmin, request: Request) -> None:
    a = await _get(db, announcement_id)
    title = a.title
    await db.delete(a)
    await audit(db, actor=actor, request=request, action="announcement.delete", entity_type="announcement",
                entity_id=announcement_id, tenant_id=None, summary=f"Duyuru silindi: '{title}'")
    await db.commit()


async def active_for_tenant(db: AsyncSession, tenant_id: int) -> list[AnnouncementPublic]:
    today = date.today()
    targeted = select(AnnouncementTarget.announcement_id).where(AnnouncementTarget.tenant_id == tenant_id)
    rows = (await db.execute(
        select(Announcement).where(
            Announcement.starts_on <= today,
            or_(Announcement.ends_on.is_(None), Announcement.ends_on >= today),
            or_(Announcement.target_all.is_(True), Announcement.id.in_(targeted)),
        ).order_by(Announcement.id.desc())
    )).scalars().all()
    return [AnnouncementPublic(id=a.id, title=a.title, body=a.body, level=a.level) for a in rows]
