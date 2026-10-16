"""WhatsApp ban / kötüye kullanım koruması: IP sınırı, doğrulanmayan kod alarmı, WhatsApp'ı olmayan numara,
arka arkaya hatada otomatik durdurma, kopma tespiti, platform durdurma anahtarı, giden mesaj kuyruğu."""
import json
from datetime import datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select, text, update

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.message_log import MessageLog
from app.models.outbound_message import OutboundMessage
from app.models.verification_code import VerificationCode
from app.models.whatsapp_connection import WhatsappConnection
from app.services import whatsapp_connection_services as wa_conn, whatsapp_guard, whatsapp_queue, whatsapp_services
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


class Evo:
    """Bağlı bir instance'ı taklit eder; gönderimleri kaydeder, istenirse başarısız olur."""

    def __init__(self):
        self.sent: list[dict] = []
        self.fail = False
        self.no_wa: set[str] = set()
        self.state = "open"

    def __call__(self, request: httpx.Request):
        p = request.url.path
        if p.startswith("/chat/whatsappNumbers/"):
            num = json.loads(request.content)["numbers"][0]
            return httpx.Response(200, json=[{"exists": num not in self.no_wa, "number": num}])
        if p.startswith("/message/sendText/"):
            if self.fail:
                return httpx.Response(500)
            self.sent.append({"instance": p.rsplit("/", 1)[-1], **json.loads(request.content)})
            return httpx.Response(201, json={"key": {"id": "x"}})
        if p.startswith("/instance/connectionState/"):
            return httpx.Response(200, json={"instance": {"state": self.state}})
        if p == "/instance/fetchInstances":
            return httpx.Response(200, json=[{"ownerJid": "905321112233@s.whatsapp.net"}])
        return httpx.Response(404)


@pytest.fixture
def evo(monkeypatch):
    fake = Evo()
    monkeypatch.setattr(whatsapp_services, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake)))
    whatsapp_guard._WA_CACHE.clear()
    return fake


async def send(api, phone, slug="alfa", ip=None):
    headers = {"X-Forwarded-For": ip} if ip else None
    return await api.post("/api/auth/send-code", slug=slug, json={"phone": phone, "kvkk_accepted": True}, headers=headers)


async def test_otp_goes_from_shop_number_with_typing_delay_and_varied_text(api, shop, evo, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    await connect_whatsapp(shop.tenant.id)
    assert (await send(api, "5551230001")).status_code == 200
    m = evo.sent[0]
    assert m["instance"] == f"bt{shop.tenant.id}-test" and 900 <= m["delay"] <= 2000 and "Alfa" in m["text"]


async def test_number_without_whatsapp_is_rejected_and_not_sent(api, shop, evo, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    await connect_whatsapp(shop.tenant.id)
    evo.no_wa.add("905551230002")
    r = await send(api, "5551230002")
    assert r.status_code == 400 and "WhatsApp bulunamadı" in r.json()["detail"]
    assert evo.sent == []


async def test_ip_hourly_limit(api, shop, monkeypatch):
    monkeypatch.setattr(settings, "otp_ip_hourly_limit", 3)
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    for i in range(3):
        assert (await send(api, f"555123010{i}", ip="9.9.9.9")).status_code == 200
    r = await send(api, "5551230109", ip="9.9.9.9")
    assert r.status_code == 429 and "bağlantıdan" in r.json()["detail"]
    assert (await send(api, "5551230108", ip="8.8.8.8")).status_code == 200  # başka IP etkilenmez


async def test_unverified_code_breaker_pauses_otp_and_alerts_once(api, shop, monkeypatch):
    monkeypatch.setattr(settings, "otp_unverified_breaker", 3)
    alerts = []

    async def fake_alert(db, title, body):
        alerts.append(title)

    monkeypatch.setattr(whatsapp_guard, "alert_platform", fake_alert)
    await connect_whatsapp(shop.tenant.id, state="close")  # alarm zamanı bu satıra yazılır
    for i in range(3):
        assert (await send(api, f"555123020{i}")).status_code == 200
    async with SessionFactory() as db:  # kodlar 10 dk önce gönderilmiş ve girilmemiş olsun
        await db.execute(update(VerificationCode).values(created_at=func.now() - text("interval '10 minutes'")))
        await db.commit()
    r = await send(api, "5551230209")
    assert r.status_code == 429 and "Güvenlik" in r.json()["detail"]
    assert (await send(api, "5551230208")).status_code == 429
    assert alerts == ["Şüpheli kod trafiği"]  # saatte bir kez


async def test_consecutive_failures_auto_pause_then_reconnect_unpauses(api, shop, evo, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "whatsapp_failure_pause", 2)
    monkeypatch.setattr(whatsapp_guard, "alert_platform", lambda *a: _noop())
    await connect_whatsapp(shop.tenant.id)
    evo.fail = True
    assert (await send(api, "5551230301")).status_code == 503
    assert (await send(api, "5551230302")).status_code == 503
    r = await send(api, "5551230303")
    assert r.status_code == 503 and "durduruldu" in r.json()["detail"]
    async with SessionFactory() as db:
        row = (await db.execute(select(WhatsappConnection))).scalar_one()
        assert row.paused and row.paused_reason.startswith(whatsapp_guard.AUTO_PAUSE_PREFIX)
        # hat yeniden bağlanınca otomatik durdurma kalkar
        row.state = "connecting"
        await wa_conn._apply_state(db, row, "open")
        await db.commit()
        assert row.paused is False and row.consecutive_failures == 0


async def _noop():
    return None


async def test_platform_pause_switch_blocks_all_sending(api, shop, platform_admin, evo, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    tok = mint_platform_token(platform_admin)
    assert (await api.post(f"/api/platform/tenants/{shop.tenant.id}/whatsapp/pause", token=tok, json={"paused": True})).status_code == 409
    await connect_whatsapp(shop.tenant.id)
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/whatsapp/pause", token=tok, json={"paused": True, "reason": "Spam şikâyeti"})
    assert r.status_code == 200 and r.json()["paused"] is True and r.json()["paused_reason"] == "Spam şikâyeti"
    assert (await send(api, "5551230401")).status_code == 503
    st = (await api.get("/api/admin/whatsapp", slug="alfa", token=shop.owner_token)).json()
    assert st["paused"] is True
    sysw = (await api.get("/api/platform/system/status", token=tok)).json()["whatsapp"]
    assert [a["kind"] for a in sysw["alerts"]] == ["paused"]
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/whatsapp/pause", token=tok, json={"paused": False})
    assert r.json()["paused"] is False
    assert (await send(api, "5551230402")).status_code == 200
    detail = (await api.get(f"/api/platform/tenants/{shop.tenant.id}/whatsapp", token=tok)).json()
    assert detail["sent_24h"] >= 1 and detail["breaker_threshold"] == settings.otp_unverified_breaker


async def test_webhook_ban_like_disconnect_marks_reason_and_alerts(api, shop, monkeypatch, evo):
    monkeypatch.setattr(settings, "evolution_webhook_secret", "s")
    alerts = []

    async def fake_alert(db, title, body):
        alerts.append(body)

    monkeypatch.setattr(whatsapp_guard, "alert_platform", fake_alert)
    await connect_whatsapp(shop.tenant.id)
    evo.state = "close"  # Evolution da kapalı diyor
    payload = {"event": "connection.update", "instance": f"bt{shop.tenant.id}-test", "data": {"state": "close", "statusReason": 401}}
    assert (await api.post("/api/webhooks/evolution?token=s", json=payload)).status_code == 200
    st = (await api.get("/api/admin/whatsapp", slug="alfa", token=shop.owner_token)).json()
    assert st["state"] == "close" and st["disconnect_reason"] == "logged_out" and st["disconnected_at"]
    assert alerts and "engellenmiş" in alerts[0]


async def test_owner_disconnect_is_not_an_alert(api, shop, monkeypatch, evo):
    monkeypatch.setattr(whatsapp_guard, "alert_platform", lambda *a: (_ for _ in ()).throw(AssertionError("alarm olmamalı")))
    await connect_whatsapp(shop.tenant.id)
    monkeypatch.setattr(whatsapp_services, "logout", lambda name: _noop())
    st = (await api.post("/api/admin/whatsapp/disconnect", slug="alfa", token=shop.owner_token)).json()
    assert st["state"] == "close" and st["disconnect_reason"] is None


async def test_health_check_detects_silent_drop(shop, evo, monkeypatch):
    monkeypatch.setattr(whatsapp_guard, "alert_platform", lambda *a: _noop())
    await connect_whatsapp(shop.tenant.id)
    evo.state = "close"
    async with SessionFactory() as db:
        assert await wa_conn.health_check(db) == 1
        row = (await db.execute(select(WhatsappConnection))).scalar_one()
        assert row.state == "close" and row.disconnect_reason == "health_check"


# ------------------------------------------------------------------ giden mesaj kuyruğu
async def test_queue_sends_all_messages_paced_and_clears_content(shop, evo, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_queue_gap_min", 0.0)
    monkeypatch.setattr(settings, "whatsapp_queue_gap_max", 0.0)
    await connect_whatsapp(shop.tenant.id)
    async with SessionFactory() as db:
        for i in range(5):
            await whatsapp_queue.enqueue(db, shop.tenant.id, "appointment_confirm", f"555123050{i}", f"Randevunuz onaylandı {i}")
        await db.commit()
    async with SessionFactory() as db:
        while await whatsapp_queue.process_one(db):
            pass
    assert len(evo.sent) == 5 and all(1500 <= m["delay"] <= 3500 for m in evo.sent)  # hacim sınırı yok, hepsi gider
    async with SessionFactory() as db:
        rows = (await db.execute(select(OutboundMessage))).scalars().all()
        assert {r.status for r in rows} == {"sent"} and all(r.to_phone is None and r.body is None for r in rows)


async def test_queue_respects_gap_between_messages_of_same_number(shop, evo, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_queue_gap_min", 60.0)
    monkeypatch.setattr(settings, "whatsapp_queue_gap_max", 60.0)
    await connect_whatsapp(shop.tenant.id)
    async with SessionFactory() as db:
        for i in range(2):
            await whatsapp_queue.enqueue(db, shop.tenant.id, "appointment_confirm", f"555123060{i}", "x")
        await db.commit()
    async with SessionFactory() as db:
        assert await whatsapp_queue.process_one(db) is True
        assert await whatsapp_queue.process_one(db) is False  # aynı numaradan 60 sn dolmadan ikinci mesaj yok
    assert len(evo.sent) == 1


async def test_queue_waits_while_not_connected_and_expires(shop, evo):
    async with SessionFactory() as db:
        await whatsapp_queue.enqueue(db, shop.tenant.id, "appointment_confirm", "5551230701", "x")
        await db.commit()
    async with SessionFactory() as db:
        assert await whatsapp_queue.process_one(db) is False  # bağlı değil: bekler, düşmez
        await db.execute(update(OutboundMessage).values(created_at=datetime.now() - timedelta(hours=25)))
        await db.commit()
        await whatsapp_queue.housekeeping(db)
        assert (await db.execute(select(OutboundMessage.status))).scalar_one() == "cancelled"


def test_quiet_hours_only_for_reminders():
    late = datetime(2026, 10, 16, 23, 15)
    early = datetime(2026, 10, 16, 6, 0)
    noon = datetime(2026, 10, 16, 12, 0)
    assert whatsapp_queue._after_quiet(late) == datetime(2026, 10, 17, 8, 30)
    assert whatsapp_queue._after_quiet(early) == datetime(2026, 10, 16, 8, 30)
    assert whatsapp_queue._after_quiet(noon) == noon


async def test_queue_retries_with_backoff_then_fails(shop, evo, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_queue_gap_min", 0.0)
    monkeypatch.setattr(settings, "whatsapp_queue_gap_max", 0.0)
    monkeypatch.setattr(settings, "whatsapp_failure_pause", 99)
    await connect_whatsapp(shop.tenant.id)
    evo.fail = True
    async with SessionFactory() as db:
        await whatsapp_queue.enqueue(db, shop.tenant.id, "appointment_confirm", "5551230801", "x")
        await db.commit()
    for _ in range(3):
        async with SessionFactory() as db:
            await db.execute(update(OutboundMessage).values(not_before=datetime.now() - timedelta(seconds=1)))
            await db.commit()
            assert await whatsapp_queue.process_one(db) is True
    async with SessionFactory() as db:
        m = (await db.execute(select(OutboundMessage))).scalar_one()
        assert m.status == "failed" and m.attempts == 3 and m.body is None
