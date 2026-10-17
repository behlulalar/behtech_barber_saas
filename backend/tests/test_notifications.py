"""Bildirim kutusu: duyurular + işletmeye özel bildirimler, sunucuda okundu bilgisi, WhatsApp kopma uyarısı."""
from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.whatsapp_connection import WhatsappConnection
from app.services import whatsapp_connection_services as wa_svc
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


async def _inbox(api, slug, token):
    r = await api.get("/api/admin/inbox", slug=slug, token=token)
    assert r.status_code == 200
    return r.json()


async def test_direct_notification_and_read_state(api, shop, shop2, platform_admin):
    tok = mint_platform_token(platform_admin)
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/notifications", token=tok,
                       json={"title": "Bakım", "body": "Gece 02:00", "level": "critical"})
    assert r.status_code == 201 and r.json()["read_at"] is None
    box = await _inbox(api, "alfa", shop.owner_token)
    assert box["unread"] == 1 and box["items"][0]["level"] == "critical" and not box["items"][0]["read"]
    assert (await _inbox(api, "beta", shop2.owner_token))["items"] == []  # başka işletme görmez

    key = box["items"][0]["key"]
    assert (await api.post("/api/admin/inbox/read", slug="alfa", token=shop.owner_token, json={"keys": [key]})).status_code == 204
    after = await _inbox(api, "alfa", shop.owner_token)
    assert after["unread"] == 0 and after["items"][0]["read"]
    listed = (await api.get(f"/api/platform/tenants/{shop.tenant.id}/notifications", token=tok)).json()
    assert listed[0]["read_at"] is not None  # platform okunduğunu görür


async def test_cannot_mark_other_tenants_notification(api, shop, shop2, platform_admin):
    tok = mint_platform_token(platform_admin)
    await api.post(f"/api/platform/tenants/{shop.tenant.id}/notifications", token=tok, json={"title": "x", "body": "y"})
    key = (await _inbox(api, "alfa", shop.owner_token))["items"][0]["key"]
    await api.post("/api/admin/inbox/read", slug="beta", token=shop2.owner_token, json={"keys": [key]})
    assert (await _inbox(api, "alfa", shop.owner_token))["unread"] == 1


async def test_announcement_read_is_server_side_and_counted(api, shop, shop2, platform_admin):
    tok = mint_platform_token(platform_admin)
    a = (await api.post("/api/platform/announcements", token=tok,
                        json={"title": "Bakım", "body": "x", "level": "critical"})).json()
    assert a["level"] == "critical"
    box = await _inbox(api, "alfa", shop.owner_token)
    assert box["unread"] == 1 and box["items"][0]["key"] == f"a:{a['id']}"
    await api.post("/api/admin/inbox/read-all", slug="alfa", token=shop.owner_token)
    assert (await _inbox(api, "alfa", shop.owner_token))["unread"] == 0
    assert (await _inbox(api, "beta", shop2.owner_token))["unread"] == 1  # okuma işletmeye özel
    row = [x for x in (await api.get("/api/platform/announcements", token=tok)).json() if x["id"] == a["id"]][0]
    assert row["read_count"] == 1 and row["target_count"] >= 2


async def test_inbox_requires_login_and_staff_hides_manager_alerts(api, shop, platform_admin):
    assert (await api.get("/api/admin/inbox", slug="alfa")).status_code == 401
    async with SessionFactory() as db:
        await wa_svc.notif.raise_alert(db, shop.tenant.id, "wa_disconnect", "critical", "WA koptu", "x", link="/panel/whatsapp")
        await db.commit()
    assert (await _inbox(api, "alfa", shop.owner_token))["unread"] == 1
    assert (await _inbox(api, "alfa", shop.staff_token))["items"] == []  # personel yönetici uyarısını görmez


async def test_whatsapp_disconnect_raises_once_and_reconnect_resolves(api, shop):
    async with SessionFactory() as db:
        row = WhatsappConnection(tenant_id=shop.tenant.id, instance_name="bt-test", state="open", phone="905550000000")
        db.add(row)
        await db.commit()
        await wa_svc._apply_state(db, row, "close", reason="401")
        await db.commit()
        row.state = "open"  # tekrar kop: ikinci uyarı açılmamalı
        await wa_svc._apply_state(db, row, "close", reason="401")
        await db.commit()
    box = await _inbox(api, "alfa", shop.owner_token)
    alerts = [i for i in box["items"] if i["kind"] == "whatsapp"]
    assert len(alerts) == 1 and alerts[0]["level"] == "critical" and alerts[0]["link"] == "/panel/whatsapp"
    async with SessionFactory() as db:
        row = (await db.execute(select(WhatsappConnection).where(WhatsappConnection.tenant_id == shop.tenant.id))).scalar_one()
        row.phone = "905550000000"  # owner() çağrısını atla
        await wa_svc._apply_state(db, row, "open")
        await db.commit()
    assert (await _inbox(api, "alfa", shop.owner_token))["unread"] == 0


async def test_platform_send_requires_admin_and_validates(api, shop, platform_admin):
    assert (await api.post(f"/api/platform/tenants/{shop.tenant.id}/notifications", token=shop.owner_token,
                           json={"title": "x", "body": "y"})).status_code == 401
    tok = mint_platform_token(platform_admin)
    assert (await api.post(f"/api/platform/tenants/{shop.tenant.id}/notifications", token=tok,
                           json={"title": "", "body": "y"})).status_code == 422
    assert (await api.post("/api/platform/tenants/999999/notifications", token=tok,
                           json={"title": "x", "body": "y"})).status_code == 404
