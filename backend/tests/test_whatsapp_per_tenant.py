"""Dükkân başına WhatsApp: bağlama (QR/eşleştirme kodu), durum, kesme, webhook, müşteri sitesinde otp_available."""
import json

import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.whatsapp_connection import WhatsappConnection
from app.services import whatsapp_services
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


class FakeEvolution:
    """Evolution v2'yi taklit eder: instance'lar ve durumları bellekte."""

    def __init__(self):
        self.state: dict[str, str] = {}
        self.calls: list[tuple[str, str]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.calls.append((request.method, path))
        if path == "/instance/create":
            name = json.loads(request.content)["instanceName"]
            if name in self.state:
                return httpx.Response(403, json={"response": {"message": ["This name is already in use."]}})
            self.state[name] = "close"
            return httpx.Response(201, json={"instance": {"instanceName": name, "status": "created"}})
        name = path.rsplit("/", 1)[-1]
        if path.startswith("/instance/connectionState/"):
            if name not in self.state:
                return httpx.Response(404, json={})
            return httpx.Response(200, json={"instance": {"instanceName": name, "state": self.state[name]}})
        if path.startswith("/instance/connect/"):
            self.state[name] = "connecting"
            num = request.url.params.get("number")
            return httpx.Response(200, json={"base64": "data:image/png;base64,QUJD", "code": "2@x", "pairingCode": "WZYEH1YY" if num else None})
        if path == "/instance/fetchInstances":
            return httpx.Response(200, json=[{"name": request.url.params.get("instanceName"), "ownerJid": "905321112233@s.whatsapp.net", "profileName": "Usta"}])
        if path.startswith("/instance/logout/"):
            self.state[name] = "close"
            return httpx.Response(200, json={"status": "SUCCESS"})
        if path.startswith("/message/sendText/"):
            return httpx.Response(201, json={"key": {"id": "x"}})
        return httpx.Response(404)


@pytest.fixture
def evo(monkeypatch):
    fake = FakeEvolution()
    monkeypatch.setattr(whatsapp_services, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake)))
    return fake


async def test_connect_flow_qr_then_pairing_code_then_open(api, shop, shop2, evo):
    r = await api.get("/api/admin/whatsapp", slug="alfa", token=shop.owner_token)
    assert r.status_code == 200 and r.json()["state"] == "close"

    r = await api.post("/api/admin/whatsapp/connect", slug="alfa", token=shop.owner_token, json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["state"] == "connecting" and body["qr_base64"].startswith("data:image/png;base64,") and body["pairing_code"] is None

    r = await api.post("/api/admin/whatsapp/connect", slug="alfa", token=shop.owner_token, json={"phone": "5321112233"})
    assert r.json()["pairing_code"] == "WZYEH1YY"  # ikinci çağrı: instance zaten var (403) -> sorun değil

    name = f"bt{shop.tenant.id}-alfa"
    assert name in evo.state
    evo.state[name] = "open"  # kullanıcı telefondan okuttu
    r = (await api.get("/api/admin/whatsapp", slug="alfa", token=shop.owner_token)).json()
    assert r["state"] == "open" and r["phone"] == "905321112233" and r["profile_name"] == "Usta"

    # Diğer dükkân etkilenmez
    assert (await api.get("/api/admin/whatsapp", slug="beta", token=shop2.owner_token)).json()["state"] == "close"
    assert (await api.get("/api/public/tenant", slug="alfa")).json()["otp_available"] is True


async def test_disconnect_and_permissions(api, shop, evo):
    await api.post("/api/admin/whatsapp/connect", slug="alfa", token=shop.owner_token, json={})
    evo.state[f"bt{shop.tenant.id}-alfa"] = "open"
    await api.get("/api/admin/whatsapp", slug="alfa", token=shop.owner_token)
    r = await api.post("/api/admin/whatsapp/disconnect", slug="alfa", token=shop.owner_token)
    assert r.json()["state"] == "close" and r.json()["phone"] is None
    # personel bağlayamaz
    assert (await api.post("/api/admin/whatsapp/connect", slug="alfa", token=shop.staff_token, json={})).status_code == 403
    assert (await api.get("/api/admin/whatsapp", slug="alfa")).status_code == 401


async def test_connect_503_when_evolution_down(api, shop, monkeypatch):
    def down(request):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(whatsapp_services, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(down)))
    r = await api.post("/api/admin/whatsapp/connect", slug="alfa", token=shop.owner_token, json={})
    assert r.status_code == 503
    r = await api.get("/api/admin/whatsapp", slug="alfa", token=shop.owner_token)
    assert r.status_code == 200 and r.json()["state"] == "close"


async def test_test_message_requires_connection(api, shop, evo):
    assert (await api.post("/api/admin/whatsapp/test", slug="alfa", token=shop.owner_token, json={"phone": "5551234567"})).status_code == 409
    await connect_whatsapp(shop.tenant.id)
    async with SessionFactory() as db:
        row = (await db.execute(select(WhatsappConnection))).scalar_one()
        evo.state[row.instance_name] = "open"
    assert (await api.post("/api/admin/whatsapp/test", slug="alfa", token=shop.owner_token, json={"phone": "5551234567"})).status_code == 204


async def test_webhook_updates_state_with_secret(api, shop, monkeypatch, evo):
    monkeypatch.setattr(settings, "evolution_webhook_secret", "gizli")
    await connect_whatsapp(shop.tenant.id, state="connecting", phone=None)
    payload = {"event": "connection.update", "instance": f"bt{shop.tenant.id}-test", "data": {"state": "open"}}
    assert (await api.post("/api/webhooks/evolution", json=payload)).status_code == 401
    assert (await api.post("/api/webhooks/evolution?token=yanlis", json=payload)).status_code == 401
    assert (await api.post("/api/webhooks/evolution?token=gizli", json=payload)).status_code == 200
    async with SessionFactory() as db:
        row = (await db.execute(select(WhatsappConnection))).scalar_one()
        assert row.state == "open" and row.phone == "905321112233"
    # bilinmeyen instance / olay sessizce yok sayılır
    assert (await api.post("/api/webhooks/evolution?token=gizli", json={"event": "messages.upsert", "instance": "x"})).status_code == 200


async def test_otp_available_false_in_production_when_not_connected(api, shop, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    assert (await api.get("/api/public/tenant", slug="alfa")).json()["otp_available"] is False
