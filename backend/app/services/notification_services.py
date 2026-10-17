"""İşletme paneli bildirim kutusu: platform duyuruları + işletmeye özel bildirimler (okundu bilgisi sunucuda)."""
from datetime import datetime

from fastapi import HTTPException, Request
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import Announcement
from app.models.notification import AnnouncementRead, Notification
from app.models.platform_admin import PlatformAdmin
from app.models.tenant import Tenant
from app.schemas.notification import InboxItem, InboxOut, NotificationIn, NotificationOut
from app.services import announcement_services
from app.services.audit_services import audit

INBOX_LIMIT = 30


async def inbox(db: AsyncSession, tenant_id: int, is_manager: bool) -> InboxOut:
    """Geçerli duyurular + bu işletmenin bildirimleri; en yeni üstte. unread = okunmamış sayısı."""
    read_ids = set((await db.execute(
        select(AnnouncementRead.announcement_id).where(AnnouncementRead.tenant_id == tenant_id)
    )).scalars().all())
    items: list[InboxItem] = []
    for a in await announcement_services.active_for_tenant(db, tenant_id):
        items.append(InboxItem(key=f"a:{a.id}", source="announcement", kind="announcement", level=a.level, title=a.title,
                               body=a.body, created_at=a.created_at, read=a.id in read_ids))
    q = select(Notification).where(Notification.tenant_id == tenant_id).order_by(Notification.id.desc()).limit(INBOX_LIMIT)
    if not is_manager:
        q = q.where(Notification.managers_only.is_(False))
    for n in (await db.execute(q)).scalars().all():
        items.append(InboxItem(key=f"n:{n.id}", source="notification", kind=n.kind, level=n.level, title=n.title,
                               body=n.body, link=n.link, created_at=n.created_at, read=n.read_at is not None))
    items.sort(key=lambda i: i.created_at or datetime.min, reverse=True)
    items = items[:INBOX_LIMIT]
    return InboxOut(unread=sum(1 for i in items if not i.read), items=items)


async def mark_read(db: AsyncSession, tenant_id: int, keys: list[str] | None) -> None:
    """keys=None → hepsini okundu say. Başka işletmenin kaydına dokunulamaz (tenant_id filtresi)."""
    now = datetime.now()
    if keys is None:
        aids = [a.id for a in await announcement_services.active_for_tenant(db, tenant_id)]
        nids = None
    else:
        aids = [int(k[2:]) for k in keys if k.startswith("a:") and k[2:].isdigit()]
        nids = [int(k[2:]) for k in keys if k.startswith("n:") and k[2:].isdigit()]
    if aids:
        have = set((await db.execute(select(AnnouncementRead.announcement_id).where(
            AnnouncementRead.tenant_id == tenant_id, AnnouncementRead.announcement_id.in_(aids)))).scalars().all())
        db.add_all([AnnouncementRead(announcement_id=i, tenant_id=tenant_id, read_at=now) for i in aids if i not in have])
    stmt = update(Notification).where(Notification.tenant_id == tenant_id, Notification.read_at.is_(None))
    if nids is not None:
        if not nids:
            await db.commit()
            return
        stmt = stmt.where(Notification.id.in_(nids))
    await db.execute(stmt.values(read_at=now))
    await db.commit()


async def raise_alert(db: AsyncSession, tenant_id: int, dedupe_key: str, level: str, title: str, body: str,
                      link: str | None = None, managers_only: bool = True) -> None:
    """Sistem uyarısı; aynı anahtarlı okunmamış uyarı varsa yenisini açmaz. Commit ÇAĞIRANDA."""
    exists = (await db.execute(select(Notification.id).where(
        Notification.tenant_id == tenant_id, Notification.dedupe_key == dedupe_key, Notification.read_at.is_(None)
    ).limit(1))).first()
    if exists:
        return
    db.add(Notification(tenant_id=tenant_id, kind="whatsapp", level=level, title=title, body=body, link=link,
                        managers_only=managers_only, dedupe_key=dedupe_key))


async def resolve_alert(db: AsyncSession, tenant_id: int, dedupe_key: str) -> None:
    """Sorun giderilince ilgili okunmamış uyarıyı kapatır. Commit ÇAĞIRANDA."""
    await db.execute(update(Notification).where(
        Notification.tenant_id == tenant_id, Notification.dedupe_key == dedupe_key, Notification.read_at.is_(None)
    ).values(read_at=datetime.now()))


async def send_to_tenant(db: AsyncSession, tenant_id: int, data: NotificationIn, actor: PlatformAdmin, request: Request) -> NotificationOut:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    n = Notification(tenant_id=tenant_id, kind="message", level=data.level, title=data.title.strip(), body=data.body.strip())
    db.add(n)
    await db.flush()
    await audit(db, actor=actor, request=request, action="notification.send", entity_type="tenant", entity_id=tenant_id,
                tenant_id=tenant_id, summary=f"'{tenant.name}' işletmesine bildirim gönderildi: '{n.title}'",
                details={"level": n.level})
    await db.commit()
    await db.refresh(n)
    return NotificationOut.model_validate(n, from_attributes=True)


async def list_for_tenant(db: AsyncSession, tenant_id: int) -> list[NotificationOut]:
    rows = (await db.execute(select(Notification).where(Notification.tenant_id == tenant_id)
                             .order_by(Notification.id.desc()).limit(50))).scalars().all()
    return [NotificationOut.model_validate(r, from_attributes=True) for r in rows]


async def announcement_stats(db: AsyncSession, ids: list[int]) -> tuple[dict[int, int], int]:
    """({duyuru_id: okuyan işletme sayısı}, hedef 'tümü' olduğunda işletme sayısı)."""
    reads: dict[int, int] = {}
    if ids:
        reads = dict((await db.execute(
            select(AnnouncementRead.announcement_id, func.count()).where(AnnouncementRead.announcement_id.in_(ids))
            .group_by(AnnouncementRead.announcement_id))).all())
    all_count = (await db.execute(select(func.count()).select_from(Tenant).where(
        Tenant.is_active.is_(True), func.coalesce(Tenant.signup_status, "approved") == "approved"))).scalar_one()
    return reads, all_count
