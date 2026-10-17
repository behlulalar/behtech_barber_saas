"""İşletmeden platforma destek talepleri. Yanıt: işletmenin bildirim kutusuna düşer, talep kapanır."""
import logging
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.staff import Staff
from app.models.support_ticket import SupportTicket
from app.models.tenant import Tenant
from app.schemas.support import PlatformTicketOut, TicketIn, TicketOut, TicketReplyIn
from app.services.audit_services import audit

logger = logging.getLogger(__name__)
MAX_OPEN_PER_TENANT = 5
MAX_PER_DAY = 10
CATEGORY_LABELS = {"whatsapp": "WhatsApp", "appointments": "Randevular", "payment": "Ödeme", "other": "Diğer"}


def _out(t: SupportTicket) -> TicketOut:
    return TicketOut.model_validate(t, from_attributes=True)


async def create(db: AsyncSession, tenant: Tenant, staff: Staff, data: TicketIn) -> TicketOut:
    since = datetime.now() - timedelta(days=1)
    open_n = (await db.execute(select(func.count()).select_from(SupportTicket).where(
        SupportTicket.tenant_id == tenant.id, SupportTicket.status == "open"))).scalar_one()
    day_n = (await db.execute(select(func.count()).select_from(SupportTicket).where(
        SupportTicket.tenant_id == tenant.id, SupportTicket.created_at > since))).scalar_one()
    if open_n >= MAX_OPEN_PER_TENANT or day_n >= MAX_PER_DAY:
        raise HTTPException(status_code=429, detail="Çok fazla açık talebiniz var. Mevcut taleplerinize yanıt gelmesini bekleyin")
    t = SupportTicket(tenant_id=tenant.id, staff_id=staff.id, category=data.category, message=data.message.strip())
    db.add(t)
    await db.commit()
    await db.refresh(t)
    # Platform sahibine anında haber (push + e-posta): ARKA PLANDA; yavaş/çalışmayan push servisi işletmeyi bekletmesin.
    from app.services import whatsapp_guard

    whatsapp_guard.alert_platform_background("Yeni destek talebi", f"{tenant.name} ({CATEGORY_LABELS[t.category]}): {t.message[:140]}")
    return _out(t)


async def list_for_tenant(db: AsyncSession, tenant_id: int, limit: int = 10) -> list[TicketOut]:
    rows = (await db.execute(select(SupportTicket).where(SupportTicket.tenant_id == tenant_id)
                             .order_by(SupportTicket.id.desc()).limit(limit))).scalars().all()
    return [_out(r) for r in rows]


async def list_all(db: AsyncSession, status: str | None) -> list[PlatformTicketOut]:
    q = (select(SupportTicket, Tenant.name, Staff.name, Staff.surname, Staff.phone)
         .join(Tenant, Tenant.id == SupportTicket.tenant_id)
         .outerjoin(Staff, Staff.id == SupportTicket.staff_id)
         .order_by(SupportTicket.id.desc()).limit(200))
    if status in ("open", "closed"):
        q = q.where(SupportTicket.status == status)
    out = []
    for t, tname, sname, ssurname, sphone in (await db.execute(q)).all():
        base = _out(t).model_dump()
        out.append(PlatformTicketOut(**base, tenant_id=t.tenant_id, tenant_name=tname,
                                     staff_name=" ".join(p for p in (sname, ssurname) if p) or None, staff_phone=sphone))
    return out


async def open_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(SupportTicket).where(SupportTicket.status == "open"))).scalar_one()


async def _get(db: AsyncSession, ticket_id: int) -> SupportTicket:
    t = (await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    return t


async def reply(db: AsyncSession, ticket_id: int, data: TicketReplyIn, actor, request: Request) -> TicketOut:
    t = await _get(db, ticket_id)
    if t.status == "closed":
        raise HTTPException(status_code=409, detail="Bu talep zaten kapatılmış")
    t.reply, t.status, t.closed_at = data.message.strip(), "closed", datetime.now()
    db.add(Notification(tenant_id=t.tenant_id, kind="message", level="info", title="Destek talebinize yanıt", body=t.reply))
    await audit(db, actor=actor, request=request, action="support.reply", entity_type="tenant", entity_id=t.tenant_id,
                tenant_id=t.tenant_id, summary=f"Destek talebi #{t.id} yanıtlandı", details={"ticket_id": t.id})
    await db.commit()
    return _out(t)


async def close(db: AsyncSession, ticket_id: int, actor, request: Request) -> TicketOut:
    t = await _get(db, ticket_id)
    if t.status != "closed":
        t.status, t.closed_at = "closed", datetime.now()
        await audit(db, actor=actor, request=request, action="support.close", entity_type="tenant", entity_id=t.tenant_id,
                    tenant_id=t.tenant_id, summary=f"Destek talebi #{t.id} yanıtsız kapatıldı", details={"ticket_id": t.id})
        await db.commit()
    return _out(t)
