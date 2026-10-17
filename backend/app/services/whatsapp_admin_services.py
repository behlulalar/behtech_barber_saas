"""Platform tarafı: dükkân WhatsApp hattının koruma göstergeleri ve elle durdurma."""
from datetime import datetime

from fastapi import HTTPException, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.message_log import MessageLog
from app.models.outbound_message import OutboundMessage
from app.models.platform_admin import PlatformAdmin
from app.models.tenant import Tenant
from app.models.verification_code import VerificationCode
from app.models.whatsapp_connection import WhatsappConnection
from app.schemas.whatsapp import PlatformWhatsappOut
from app.services import notification_services as notif
from app.services.audit_services import audit


async def _tenant(db: AsyncSession, tenant_id: int) -> Tenant:
    t = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return t


async def platform_status(db: AsyncSession, tenant_id: int) -> PlatformWhatsappOut:
    await _tenant(db, tenant_id)
    row = (await db.execute(select(WhatsappConnection).where(WhatsappConnection.tenant_id == tenant_id))).scalar_one_or_none()
    day = func.now() - text("interval '24 hours'")
    hour = func.now() - text("interval '60 minutes'")

    async def n(q) -> int:
        return (await db.execute(q)).scalar_one()

    base = select(func.count()).select_from(MessageLog).where(MessageLog.tenant_id == tenant_id, MessageLog.created_at > day)
    out = PlatformWhatsappOut(
        state=row.state if row else "close", server_reachable=True,
        sent_24h=await n(base.where(MessageLog.ok == True)),  # noqa: E712
        failed_24h=await n(base.where(MessageLog.ok == False)),  # noqa: E712
        queue_pending=await n(select(func.count()).select_from(OutboundMessage).where(
            OutboundMessage.tenant_id == tenant_id, OutboundMessage.status == "pending")),
        unverified_last_hour=await n(select(func.count()).select_from(VerificationCode).where(
            VerificationCode.tenant_id == tenant_id, VerificationCode.purpose == "login",
            VerificationCode.is_used == False, VerificationCode.created_at > hour,  # noqa: E712
            VerificationCode.created_at < func.now() - text("interval '3 minutes'"))),
        breaker_threshold=settings.otp_unverified_breaker,
    )
    if row:
        out = out.model_copy(update=dict(
            phone=row.phone, profile_name=row.profile_name, connected_at=row.connected_at, paused=row.paused,
            paused_reason=row.paused_reason, disconnect_reason=row.disconnect_reason, disconnected_at=row.disconnected_at,
            instance_name=row.instance_name, consecutive_failures=row.consecutive_failures,
            abuse_alerted_at=row.abuse_alerted_at,
        ))
    return out


async def set_paused(db: AsyncSession, tenant_id: int, paused: bool, reason: str | None,
                     actor: PlatformAdmin, request: Request) -> PlatformWhatsappOut:
    tenant = await _tenant(db, tenant_id)
    row = (await db.execute(select(WhatsappConnection).where(WhatsappConnection.tenant_id == tenant_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=409, detail="Bu işletme henüz WhatsApp bağlamadı")
    row.paused = paused
    row.paused_at = datetime.now() if paused else None
    row.paused_reason = ((reason or "").strip()[:200] or "Platform yöneticisi durdurdu") if paused else None
    if not paused:
        row.consecutive_failures = 0
        await notif.resolve_alert(db, tenant_id, "wa_paused")
    else:
        await notif.raise_alert(db, tenant_id, "wa_paused", "warning", "WhatsApp gönderimi durduruldu",
                                f"{row.paused_reason}. Ayrıntı için bizimle iletişime geçin.", link="/panel/whatsapp")
    await audit(db, actor=actor, request=request, action="whatsapp.pause" if paused else "whatsapp.resume",
                entity_type="tenant", entity_id=tenant.id, tenant_id=tenant.id,
                summary=f"'{tenant.name}' WhatsApp gönderimi {'durduruldu' if paused else 'yeniden açıldı'}",
                details={"reason": row.paused_reason})
    await db.commit()
    return await platform_status(db, tenant_id)
