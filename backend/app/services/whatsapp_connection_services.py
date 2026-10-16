"""Dükkân başına WhatsApp bağlantısı: instance oluşturma, QR/eşleştirme kodu, durum, bağlantıyı kesme."""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.models.whatsapp_connection import WhatsappConnection
from app.services import whatsapp_guard as guard, whatsapp_services as evo

UNREACHABLE = "WhatsApp sunucusuna şu an ulaşılamıyor, lütfen biraz sonra tekrar deneyin"


def instance_name(tenant: Tenant) -> str:
    # Tenant id'si benzersizliği garanti eder; slug okunabilirlik için (slug değişse de ad sabit kalır).
    return f"bt{tenant.id}-{tenant.slug}"[:60]


async def get_row(db: AsyncSession, tenant_id: int) -> WhatsappConnection | None:
    return (await db.execute(select(WhatsappConnection).where(WhatsappConnection.tenant_id == tenant_id))).scalar_one_or_none()


async def is_open(db: AsyncSession, tenant_id: int) -> bool:
    row = await get_row(db, tenant_id)
    return row is not None and row.state == "open"


# Evolution/Baileys kopma kodları: 401 = oturum kapatıldı (cihaz telefondan kaldırıldı ya da hesap engellendi),
# 403 = erişim yasak (çoğunlukla ban). Diğerleri geçici ağ kopmalarıdır.
BAN_LIKE = {"401": "logged_out", "403": "forbidden"}


async def _apply_state(db: AsyncSession, row: WhatsappConnection, state: str, reason: str | None = None,
                       user_initiated: bool = False) -> None:
    was_open = row.state == "open"
    row.state = state
    if state == "open":
        if not was_open or not row.phone:
            try:
                row.phone, row.profile_name = await evo.owner(row.instance_name)
            except evo.EvolutionError:
                pass
            row.connected_at = row.connected_at if was_open else datetime.now()
        row.disconnect_reason = row.disconnected_at = None
        row.consecutive_failures = 0
        if row.paused and (row.paused_reason or "").startswith(guard.AUTO_PAUSE_PREFIX):
            row.paused, row.paused_reason, row.paused_at = False, None, None  # yeniden bağlandı: otomatik durdurma kalkar
    elif state == "close":
        phone = row.phone
        row.phone = row.profile_name = row.connected_at = None
        if was_open and not user_initiated:
            # Sahip kesmedi: hat koptu ya da engellendi. Panelde şerit + platforma bildirim.
            row.disconnect_reason = BAN_LIKE.get(str(reason), reason or "connection_lost")[:60]
            row.disconnected_at = datetime.now()
            name = (await db.execute(select(Tenant.name).where(Tenant.id == row.tenant_id))).scalar_one_or_none()
            kind = "engellenmiş ya da oturumu kapatılmış olabilir" if str(reason) in BAN_LIKE else "bağlantısı koptu"
            await guard.alert_platform(db, "İşletme WhatsApp'ı koptu",
                                       f"'{name}' WhatsApp hattı ({phone or '-'}) {kind}. Müşteriler kod alamıyor.")


async def refresh(db: AsyncSession, tenant: Tenant) -> tuple[WhatsappConnection | None, bool]:
    """Evolution'dan güncel durumu çeker. (satır, sunucuya ulaşıldı mı)."""
    row = await get_row(db, tenant.id)
    if row is None:
        return None, evo.configured()
    try:
        state = await evo.connection_state(row.instance_name)
    except evo.EvolutionError:
        return row, False
    if state != row.state or (state == "open" and not row.phone):
        await _apply_state(db, row, state)
        await db.commit()
    return row, True


async def start_connect(db: AsyncSession, tenant: Tenant, number: str | None) -> tuple[WhatsappConnection, str | None, str | None]:
    row = await get_row(db, tenant.id)
    if row is None:
        row = WhatsappConnection(tenant_id=tenant.id, instance_name=instance_name(tenant), state="close")
        db.add(row)
        await db.flush()
    try:
        await evo.create_instance(row.instance_name)
        state = await evo.connection_state(row.instance_name)
        if state == "open":
            await _apply_state(db, row, "open")
            await db.commit()
            return row, None, None
        qr, code = await evo.connect(row.instance_name, number)
    except evo.EvolutionError:
        await db.rollback()
        raise HTTPException(status_code=503, detail=UNREACHABLE)
    row.state = "connecting"
    await db.commit()
    return row, qr, code


async def disconnect(db: AsyncSession, tenant: Tenant) -> WhatsappConnection | None:
    row = await get_row(db, tenant.id)
    if row is None:
        return None
    try:
        await evo.logout(row.instance_name)
    except evo.EvolutionError:
        raise HTTPException(status_code=503, detail=UNREACHABLE)
    await _apply_state(db, row, "close", user_initiated=True)
    await db.commit()
    return row


async def health_check(db: AsyncSession) -> int:
    """Bağlı görünen hatları Evolution'a sorar (webhook kaçırıldıysa kopmayı yakalar). Kopan sayısını döner."""
    rows = (await db.execute(select(WhatsappConnection).where(WhatsappConnection.state == "open"))).scalars().all()
    dropped = 0
    for row in rows:
        try:
            state = await evo.connection_state(row.instance_name)
        except evo.EvolutionError:
            return dropped  # sunucuya ulaşılamıyor: hatları kopmuş sayma
        if state != "open":
            await _apply_state(db, row, state, reason="health_check")
            dropped += 1
    await db.commit()
    return dropped


async def handle_webhook(db: AsyncSession, payload: dict) -> None:
    """CONNECTION_UPDATE: {"event": "connection.update", "instance": "<ad>", "data": {"state": "open", ...}}."""
    event = str(payload.get("event") or "").lower().replace("_", ".")
    if event != "connection.update":
        return
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    name = payload.get("instance") or data.get("instance")
    state = data.get("state")
    if not name or state not in ("open", "connecting", "close"):
        return
    row = (await db.execute(select(WhatsappConnection).where(WhatsappConnection.instance_name == name))).scalar_one_or_none()
    if row is None:
        return
    reason = data.get("statusReason") if state == "close" else None
    await _apply_state(db, row, state, reason=str(reason) if reason is not None else None)
    await db.commit()
