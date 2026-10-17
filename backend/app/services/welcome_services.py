"""Dükkânın WhatsApp numarasına biri yazınca karşılama + randevu bağlantısı (aynı kişiye 24 saatte BİR kez).

Güvenlik: yalnızca bireysel sohbetler (grup/yayın/durum yok), kendi mesajlarımıza (fromMe) ve eski mesajlara
(yeniden bağlanınca gelen birikmiş geçmiş) cevap verilmez; 24 saat tekrarı otomatik cevap döngüsünü ve bot görüntüsünü önler;
dükkân başına saatlik karşılama tavanı vardır. Karşılama da kuyruktan, rastgele gecikmeyle gider."""
import hashlib
import logging
import time as _time
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outbound_message import OutboundMessage
from app.models.tenant import Tenant
from app.models.welcome_contact import WelcomeContact
from app.models.whatsapp_connection import WhatsappConnection
from app.services import cancel_by_message, whatsapp_queue as queue, whatsapp_texts as texts

logger = logging.getLogger(__name__)

COOLDOWN = timedelta(hours=24)
MAX_AGE_SECONDS = 300  # bundan eski mesaj (çevrimdışı birikmiş) karşılanmaz
HOURLY_CAP = 40
IGNORED_TYPES = {"protocolMessage", "reactionMessage", "senderKeyDistributionMessage", "pollUpdateMessage", "editedMessage"}


def _items(payload: dict) -> list[dict]:
    data = payload.get("data")
    if isinstance(data, dict):
        inner = data.get("messages")
        return [m for m in inner if isinstance(m, dict)] if isinstance(inner, list) else [data]
    return [m for m in data if isinstance(m, dict)] if isinstance(data, list) else []


def _target(jid: str) -> tuple[str, str] | None:
    """(kişi kimliği, gönderim hedefi). Yalnızca bireysel sohbet: @s.whatsapp.net (numara) ya da @lid."""
    if jid.endswith("@s.whatsapp.net"):
        digits = "".join(ch for ch in jid.split("@")[0].split(":")[0] if ch.isdigit())
        return (digits, digits) if digits else None
    if jid.endswith("@lid"):
        return jid, jid
    return None  # grup (@g.us), yayın/durum (@broadcast), kanal (@newsletter)


async def handle_inbound(db: AsyncSession, conn: WhatsappConnection, payload: dict) -> int:
    """Gelen mesajlar için karşılama kuyruğa alır; kuyruğa alınan sayıyı döner."""
    if conn.state != "open" or conn.paused:
        return 0
    tenant = (await db.execute(select(Tenant).where(Tenant.id == conn.tenant_id))).scalar_one_or_none()
    if tenant is None or not tenant.is_active:
        return 0
    now = datetime.now()
    queued = 0
    for item in _items(payload):
        key = item.get("key") if isinstance(item.get("key"), dict) else {}
        if key.get("fromMe") or item.get("messageType") in IGNORED_TYPES:
            continue
        target = _target(str(key.get("remoteJid") or ""))
        if target is None:
            continue
        who, to = target
        if conn.phone and who == conn.phone:
            continue  # kendi numaramız
        ts = item.get("messageTimestamp")
        try:
            if ts is not None and _time.time() - float(ts) > MAX_AGE_SECONDS:
                continue
        except (TypeError, ValueError):
            pass
        if cancel_by_message.is_cancel_request(cancel_by_message.message_text(item)):
            await cancel_by_message.process(db, tenant, who, to)  # "iptal" yazan müşteriye karşılama değil iptal akışı
            continue
        if not conn.welcome_enabled:
            continue  # işletme karşılamayı kapattı ("iptal" yanıtı yukarıda ayrıca çalışır)
        recent = (await db.execute(select(func.count()).select_from(OutboundMessage).where(
            OutboundMessage.tenant_id == conn.tenant_id, OutboundMessage.kind == "welcome",
            OutboundMessage.created_at > now - timedelta(hours=1)))).scalar_one()
        if recent >= HOURLY_CAP:
            logger.warning("Karşılama saatlik tavanı doldu (tenant %s)", conn.tenant_id)
            break
        digest = hashlib.sha256(f"{conn.tenant_id}:{who}".encode()).hexdigest()
        # Atomik: yalnızca kayıt yoksa ya da 24 saatten eskiyse güncellenir; aksi halde satır dönmez (karşılama yok).
        stmt = (
            insert(WelcomeContact).values(tenant_id=conn.tenant_id, contact_hash=digest, last_sent_at=now)
            .on_conflict_do_update(
                index_elements=["tenant_id", "contact_hash"], set_={"last_sent_at": now},
                where=WelcomeContact.last_sent_at < now - COOLDOWN,
            ).returning(WelcomeContact.contact_hash)
        )
        if (await db.execute(stmt)).first() is None:
            continue
        body = texts.render("welcome", conn.tenant_id, shop=tenant.name, link=texts.site_url(tenant.slug))
        await queue.enqueue(db, conn.tenant_id, "welcome", None, body, to_number=to)
        queued += 1
    await db.commit()
    return queued
