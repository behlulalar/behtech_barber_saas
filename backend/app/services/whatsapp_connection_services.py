"""Dükkân başına WhatsApp bağlantısı: instance oluşturma, QR/eşleştirme kodu, durum, bağlantıyı kesme."""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.models.whatsapp_connection import WhatsappConnection
from app.services import whatsapp_services as evo

UNREACHABLE = "WhatsApp sunucusuna şu an ulaşılamıyor, lütfen biraz sonra tekrar deneyin"


def instance_name(tenant: Tenant) -> str:
    # Tenant id'si benzersizliği garanti eder; slug okunabilirlik için (slug değişse de ad sabit kalır).
    return f"bt{tenant.id}-{tenant.slug}"[:60]


async def get_row(db: AsyncSession, tenant_id: int) -> WhatsappConnection | None:
    return (await db.execute(select(WhatsappConnection).where(WhatsappConnection.tenant_id == tenant_id))).scalar_one_or_none()


async def is_open(db: AsyncSession, tenant_id: int) -> bool:
    row = await get_row(db, tenant_id)
    return row is not None and row.state == "open"


async def _apply_state(db: AsyncSession, row: WhatsappConnection, state: str) -> None:
    was_open = row.state == "open"
    row.state = state
    if state == "open":
        if not was_open or not row.phone:
            try:
                row.phone, row.profile_name = await evo.owner(row.instance_name)
            except evo.EvolutionError:
                pass
            row.connected_at = row.connected_at if was_open else datetime.now()
    elif state == "close":
        row.phone = row.profile_name = row.connected_at = None


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
    await _apply_state(db, row, "close")
    await db.commit()
    return row


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
    await _apply_state(db, row, state)
    await db.commit()
