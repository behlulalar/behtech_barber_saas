"""Aşama D: indirim, duyurular, WhatsApp mesaj kaydı + işletme başına hız sınırı + sistem durumu."""
from datetime import date, timedelta

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.message_log import MessageLog
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

TODAY = date.today()


# ------------------------------------------------------------------ indirim
async def test_discount_on_custom_and_plan_subscription(api, shop, platform_admin):
    tok = mint_platform_token(platform_admin)
    plan = (await api.post("/api/platform/plans", token=tok, json={"name": "Aylık", "duration_months": 1, "price": 850})).json()
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok, json={
        "plan_id": plan["id"], "start_date": str(TODAY), "discount_percent": 20})
    assert r.status_code in (200, 201), r.text
    sub = r.json()
    assert sub["list_price"] == 850 and sub["price"] == 680 and sub["discount_percent"] == 20 and sub["balance"] == 680
    # İndirimi değiştir: liste fiyatı üzerinden yeniden hesaplanır
    up = (await api.patch(f"/api/platform/subscriptions/{sub['id']}", token=tok, json={"discount_percent": 50})).json()
    assert up["price"] == 425 and up["list_price"] == 850
    # İndirimi kaldır
    up = (await api.patch(f"/api/platform/subscriptions/{sub['id']}", token=tok, json={"discount_percent": 0})).json()
    assert up["price"] == 850 and up["list_price"] is None and up["discount_percent"] == 0
    # Liste fiyatı değişince indirim yeniden uygulanır
    up = (await api.patch(f"/api/platform/subscriptions/{sub['id']}", token=tok, json={"discount_percent": 10, "price": 1000})).json()
    assert up["price"] == 900 and up["list_price"] == 1000


async def test_discount_bounds(api, shop, platform_admin):
    tok = mint_platform_token(platform_admin)
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok, json={
        "start_date": str(TODAY), "end_date": str(TODAY + timedelta(days=29)), "price": 1000, "discount_percent": 101})
    assert r.status_code == 422
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/subscriptions", token=tok, json={
        "start_date": str(TODAY), "end_date": str(TODAY + timedelta(days=29)), "price": 1000, "discount_percent": 100})
    assert r.status_code in (200, 201) and r.json()["price"] == 0


# ------------------------------------------------------------------ duyurular
async def test_announcement_targeting_and_window(api, shop, shop2, platform_admin):
    tok = mint_platform_token(platform_admin)
    all_ = await api.post("/api/platform/announcements", token=tok, json={"title": "Bakım", "body": "Gece 02:00", "level": "warning"})
    assert all_.status_code == 201 and all_.json()["status"] == "active"
    only = await api.post("/api/platform/announcements", token=tok, json={
        "title": "Sadece alfa", "body": "x", "target_all": False, "tenant_ids": [shop.tenant.id]})
    assert only.status_code == 201
    future = await api.post("/api/platform/announcements", token=tok, json={
        "title": "Yarın", "body": "x", "starts_on": str(TODAY + timedelta(days=1))})
    assert future.json()["status"] == "scheduled"
    ended = await api.post("/api/platform/announcements", token=tok, json={
        "title": "Geçmiş", "body": "x", "starts_on": str(TODAY - timedelta(days=5)), "ends_on": str(TODAY - timedelta(days=1))})
    assert ended.json()["status"] == "ended"

    mine = (await api.get("/api/admin/announcements", slug="alfa", token=shop.owner_token)).json()
    assert sorted(a["title"] for a in mine) == ["Bakım", "Sadece alfa"]
    other = (await api.get("/api/admin/announcements", slug="beta", token=shop2.owner_token)).json()
    assert [a["title"] for a in other] == ["Bakım"]
    # personel de görür, token'sız göremez
    assert (await api.get("/api/admin/announcements", slug="alfa", token=shop.staff_token)).status_code == 200
    assert (await api.get("/api/admin/announcements", slug="alfa")).status_code == 401


async def test_announcement_validation_update_delete(api, shop, platform_admin):
    tok = mint_platform_token(platform_admin)
    assert (await api.post("/api/platform/announcements", token=tok, json={
        "title": "x", "body": "y", "target_all": False, "tenant_ids": []})).status_code == 422
    assert (await api.post("/api/platform/announcements", token=tok, json={
        "title": "x", "body": "y", "target_all": False, "tenant_ids": [999999]})).status_code == 400
    a = (await api.post("/api/platform/announcements", token=tok, json={"title": "A", "body": "B", "ends_on": str(TODAY)})).json()
    up = await api.patch(f"/api/platform/announcements/{a['id']}", token=tok, json={"title": "A2", "clear_ends_on": True})
    assert up.json()["title"] == "A2" and up.json()["ends_on"] is None
    up = await api.patch(f"/api/platform/announcements/{a['id']}", token=tok, json={"target_all": False, "tenant_ids": [shop.tenant.id]})
    assert up.json()["tenant_ids"] == [shop.tenant.id] and up.json()["target_all"] is False
    assert (await api.delete(f"/api/platform/announcements/{a['id']}", token=tok)).status_code == 204
    assert (await api.delete(f"/api/platform/announcements/{a['id']}", token=tok)).status_code == 404
    assert (await api.get("/api/platform/announcements")).status_code == 401
    assert (await api.get("/api/platform/announcements", token=shop.owner_token)).status_code == 401  # personel token'ı olmaz


# ------------------------------------------------------------------ mesaj kaydı + hız sınırı
async def test_message_logged_and_tenant_hourly_limit(api, shop, shop2, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_tenant_hourly_limit", 2)
    # farklı telefonlar: OTP'nin kendi 60 sn/telefon kuralına takılmayalım
    for phone in ("5550000001", "5550000002"):
        r = await api.post("/api/auth/send-code", slug="alfa", json={"phone": phone, "kvkk_accepted": True})
        assert r.status_code == 200
    r = await api.post("/api/auth/send-code", slug="alfa", json={"phone": "5550000003", "kvkk_accepted": True})
    assert r.status_code == 429 and "çok fazla" in r.json()["detail"].lower()
    # başka işletme etkilenmez
    assert (await api.post("/api/auth/send-code", slug="beta", json={"phone": "5550000004", "kvkk_accepted": True})).status_code == 200
    async with SessionFactory() as db:
        n = (await db.execute(select(func.count()).select_from(MessageLog).where(MessageLog.tenant_id == shop.tenant.id))).scalar_one()
        assert n == 2


async def test_failed_delivery_is_logged(api, shop, monkeypatch):
    from app.services import otp_delivery

    async def down(db, tenant_id, phone, text):
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail=otp_delivery.DELIVERY_FAILED)

    monkeypatch.setattr(otp_delivery, "_send", down)
    r = await api.post("/api/auth/send-code", slug="alfa", json={"phone": "5550000009", "kvkk_accepted": True})
    assert r.status_code == 503
    async with SessionFactory() as db:
        row = (await db.execute(select(MessageLog))).scalar_one()
        assert row.ok is False and row.kind == "otp"


async def test_system_status_whatsapp_stats(api, shop, platform_admin):
    for phone in ("5550000001", "5550000002"):
        await api.post("/api/auth/send-code", slug="alfa", json={"phone": phone, "kvkk_accepted": True})
    r = await api.get("/api/platform/system/status", token=mint_platform_token(platform_admin))
    w = r.json()["whatsapp"]
    assert w["sent_24h"] == 2 and w["failed_24h"] == 0 and w["hourly_limit"] == settings.whatsapp_tenant_hourly_limit
    assert w["top_tenants"][0]["tenant_id"] == shop.tenant.id and w["top_tenants"][0]["sent"] == 2
    assert "whatsapp_state" in r.json()["channels"]


# ------------------------------------------------------------------ kurulum rehberi
async def test_admin_setup_guide(api, shop):
    r = await api.get("/api/admin/setup", slug="alfa", token=shop.owner_token)
    assert r.status_code == 200
    keys = [c["key"] for c in r.json()["checks"]]
    assert keys == ["services", "staff", "working_hours", "staff_services", "whatsapp", "address", "first_appointment"]
    assert (await api.get("/api/admin/setup", slug="alfa", token=shop.staff_token)).status_code == 403
    assert (await api.get("/api/admin/setup", slug="alfa")).status_code == 401


async def test_admin_setup_empty_tenant_is_not_ready(api):
    t = await make_tenant("bosdukkan")
    owner = await make_staff(t.id, "Ali", "Veli", "5559998801", role=RoleType.SUPER_ADMIN)
    r = await api.get("/api/admin/setup", slug="bosdukkan", token=mint_staff_token(owner))
    s = r.json()
    by = {c["key"]: c["ok"] for c in s["checks"]}
    assert s["ready"] is False and by["services"] is False and by["working_hours"] is False and by["address"] is True  # fabrika adres girer
