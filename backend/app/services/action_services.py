"""Platform "Bugün ne yapmalıyım?" kuyruğu: dağınık uyarıları (başvuru, ödeme, WhatsApp, okunmayan acil bildirim) tek listede toplar."""
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.tenant import Tenant
from app.models.whatsapp_connection import WhatsappConnection
from app.schemas.actions import ActionItem, ActionQueueOut
from app.services import billing_services

UNREAD_CRITICAL_AFTER = timedelta(hours=24)
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
CATEGORY_ORDER = {"billing": 0, "whatsapp": 1, "notification": 2, "signup": 3}

_STATUS_TITLE = {
    "expired": ("high", "Abonelik bitti"),
    "grace": ("high", "Ek süredeyken ödeme bekleniyor"),
    "due_soon": ("medium", "Yenileme yaklaşıyor"),
}


async def build(db: AsyncSession) -> ActionQueueOut:
    items: list[ActionItem] = []

    pending = (await db.execute(
        select(Tenant.id, Tenant.name).where(Tenant.signup_status == "pending").order_by(Tenant.created_at)
    )).all()
    if pending:
        names = ", ".join(n for _i, n in pending[:3]) + (" ve diğerleri" if len(pending) > 3 else "")
        items.append(ActionItem(key="signup", severity="medium", category="signup",
                                title=f"{len(pending)} kayıt başvurusu onay bekliyor", detail=names, link="/platform/basvurular"))

    for b in await billing_services.list_tenant_billing(db):
        link = f"/platform/isletmeler/{b.tenant_id}"
        if b.status in _STATUS_TITLE:
            sev, title = _STATUS_TITLE[b.status]
            if b.is_trial and b.status == "expired":
                title = "Deneme bitti"
            elif b.is_trial and b.status == "due_soon":
                title = "Deneme bitmek üzere"
            when = (f"{b.days_left} gün kaldı" if b.days_left is not None and b.days_left >= 0
                    else f"{abs(b.days_left)} gün geçti" if b.days_left is not None else None)
            due = f"Beklenen: {b.amount_due} ₺" if b.amount_due > 0 else None
            items.append(ActionItem(key=f"billing:{b.tenant_id}", severity=sev, category="billing", title=title,
                                    detail=" · ".join(x for x in (when, due) if x) or None,
                                    tenant_id=b.tenant_id, tenant_name=b.tenant_name, link=link))
        elif b.trial_ending:
            items.append(ActionItem(key=f"billing:{b.tenant_id}", severity="medium", category="billing", title="Deneme bitmek üzere",
                                    detail=f"{b.days_left} gün kaldı" if b.days_left is not None else None,
                                    tenant_id=b.tenant_id, tenant_name=b.tenant_name, link=link))
        elif b.outstanding > 0:
            items.append(ActionItem(key=f"billing:{b.tenant_id}", severity="medium", category="billing", title="Ödenmemiş bakiye var",
                                    detail=f"{b.outstanding} ₺", tenant_id=b.tenant_id, tenant_name=b.tenant_name, link=link))

    wa = (await db.execute(
        select(WhatsappConnection, Tenant.name).join(Tenant, Tenant.id == WhatsappConnection.tenant_id)
        .where((WhatsappConnection.paused == True) | (WhatsappConnection.disconnect_reason.is_not(None)))  # noqa: E712
        .order_by(Tenant.name)
    )).all()
    for row, name in wa:
        link = f"/platform/isletmeler/{row.tenant_id}"
        if row.paused:
            items.append(ActionItem(key=f"wa:{row.tenant_id}", severity="medium", category="whatsapp", title="WhatsApp gönderimi durdurulmuş",
                                    detail=row.paused_reason, tenant_id=row.tenant_id, tenant_name=name, link=link))
        elif row.state != "open":
            items.append(ActionItem(key=f"wa:{row.tenant_id}", severity="high", category="whatsapp", title="WhatsApp bağlantısı koptu",
                                    detail="Müşteriler doğrulama kodu alamıyor", tenant_id=row.tenant_id, tenant_name=name, link=link))

    unread = (await db.execute(
        select(Notification.tenant_id, Tenant.name, func.count())
        .join(Tenant, Tenant.id == Notification.tenant_id)
        .where(Notification.kind == "message", Notification.level == "critical", Notification.read_at.is_(None),
               Notification.created_at < datetime.now() - UNREAD_CRITICAL_AFTER)
        .group_by(Notification.tenant_id, Tenant.name)
    )).all()
    for tid, name, n in unread:
        items.append(ActionItem(key=f"notif:{tid}", severity="medium", category="notification", title="Acil bildirim 24 saattir okunmadı",
                                detail=f"{n} bildirim", tenant_id=tid, tenant_name=name, link=f"/platform/isletmeler/{tid}"))

    items.sort(key=lambda i: (SEVERITY_ORDER[i.severity], CATEGORY_ORDER[i.category], i.tenant_name or ""))
    return ActionQueueOut(total=len(items), high=sum(1 for i in items if i.severity == "high"), items=items)
