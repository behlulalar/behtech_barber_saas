"""Gizli panel giriş adresi: giriş uçları anahtarı zorunlu kılar (yalnızca arayüz gizliliği değil)."""
from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.tenant import Tenant
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


async def key_of(shop) -> str:
    async with SessionFactory() as db:
        return (await db.execute(select(Tenant.login_token).where(Tenant.id == shop.tenant.id))).scalar_one()


async def test_every_tenant_gets_a_random_unique_key(shop, shop2):
    a, b = await key_of(shop), await key_of(shop2)
    assert a != b and len(a) == 12 and a.isalnum() and a == a.lower()


async def test_login_requires_the_panel_key(api, shop):
    body = {"phone": shop.owner.phone, "password": PASSWORD}
    assert (await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": None})).status_code == 404
    assert (await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": "yanlis"})).status_code == 404
    r = await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": await key_of(shop)})
    assert r.status_code == 200 and r.json()["access_token"]
    # Başka dükkânın anahtarı bu dükkânda geçmez
    other = await make_shop("beta", phone_offset=50)
    assert (await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": await key_of(other)})).status_code == 404


async def test_forgot_password_endpoints_require_key_too(api, shop):
    r = await api.post("/api/auth/forgot/send-code", slug="alfa", json={"phone": shop.staff.phone, "panel_key": None})
    assert r.status_code == 404
    r = await api.post("/api/auth/forgot/reset", slug="alfa",
                       json={"phone": shop.staff.phone, "code": "123456", "new_password": "yeni-sifre-123", "panel_key": "x"})
    assert r.status_code == 404
    assert (await api.post("/api/auth/forgot/send-code", slug="alfa", json={"phone": shop.staff.phone})).status_code == 200


async def test_wrong_keys_lock_the_ip_after_five_tries(api, shop):
    body = {"phone": shop.owner.phone, "password": PASSWORD}
    for _ in range(5):
        assert (await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": "tahmin"})).status_code == 404
    r = await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": "tahmin"})
    assert r.status_code == 429
    # kilitliyken DOĞRU anahtar bile reddedilir (tahmin ödüllendirilmez)
    assert (await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": await key_of(shop)})).status_code == 429


async def test_verify_endpoint(api, shop):
    assert (await api.post("/api/auth/panel-key/verify", slug="alfa", json={"panel_key": await key_of(shop)})).status_code == 204
    assert (await api.post("/api/auth/panel-key/verify", slug="alfa", json={"panel_key": "yok"})).status_code == 404


async def test_owner_sees_login_url_staff_does_not(api, shop):
    r = await api.get("/api/admin/login-url", slug="alfa", token=shop.owner_token)
    assert r.status_code == 200 and r.json()["path"] == f"/panel/g/{await key_of(shop)}"
    assert (await api.get("/api/admin/login-url", slug="alfa", token=shop.staff_token)).status_code == 403


async def test_platform_sees_path_and_can_regenerate(api, shop, platform_admin):
    tok = mint_platform_token(platform_admin)
    old = await key_of(shop)
    t = (await api.get(f"/api/platform/tenants/{shop.tenant.id}", token=tok)).json()
    assert t["panel_login_path"] == f"/panel/g/{old}"
    r = await api.post(f"/api/platform/tenants/{shop.tenant.id}/login-token/regenerate", token=tok)
    new = await key_of(shop)
    assert r.status_code == 200 and new != old and r.json()["panel_login_path"] == f"/panel/g/{new}"
    body = {"phone": shop.owner.phone, "password": PASSWORD}
    assert (await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": old})).status_code == 404  # eski adres ölür
    assert (await api.post("/api/auth/login", slug="alfa", json={**body, "panel_key": new})).status_code == 200
    assert (await api.post(f"/api/platform/tenants/{shop.tenant.id}/login-token/regenerate")).status_code == 401


async def test_panel_manifest_is_public_named_and_has_no_secret(api, shop):
    r = await api.get("/api/public/panel-manifest", slug="alfa")
    m = r.json()
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/manifest+json")
    assert m["name"].endswith("Yönetim") and m["start_url"] == "/panel" and m["display"] == "standalone"
    assert await key_of(shop) not in r.text  # giriş adresi/anahtar manifest'te YOK
    assert (await api.get("/api/public/panel-manifest")).status_code == 400  # dükkân adresi olmadan çözülmez


async def test_manifest_carries_key_only_when_a_valid_key_is_presented(api, shop):
    key = await key_of(shop)
    # anahtarsız (herkese açık): start_url /panel, anahtar YOK
    plain = (await api.get("/api/public/panel-manifest", slug="alfa")).json()
    assert plain["start_url"] == "/panel"
    # geçerli anahtar sunulursa kurulan uygulama anahtarı alır
    ok = await api.get(f"/api/public/panel-manifest?k={key}", slug="alfa")
    assert ok.json()["start_url"] == f"/panel?k={key}"
    # yanlış anahtar: genel manifest (sızıntı yok) ve tahmin sınırına SAYILIR
    for _ in range(5):
        bad = (await api.get("/api/public/panel-manifest?k=yanlis", slug="alfa")).json()
        assert bad["start_url"] == "/panel" and "yanlis" not in str(bad)
    locked = (await api.get(f"/api/public/panel-manifest?k={key}", slug="alfa")).json()
    assert locked["start_url"] == "/panel"  # kilitliyken doğru anahtar bile verilmez (tahmin ödüllendirilmez)
    # başka dükkânın anahtarı bu dükkânda işe yaramaz
    other = await make_shop("gama", phone_offset=70)
    assert (await api.get(f"/api/public/panel-manifest?k={await key_of(other)}", slug="alfa")).json()["start_url"] == "/panel"
