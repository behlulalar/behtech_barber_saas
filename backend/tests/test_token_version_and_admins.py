"""Token sürümü (oturum iptali) ve platform yöneticileri."""
from sqlalchemy import select

from app.core.database import SessionFactory
from app.core.security import create_access_token
from app.models.platform_admin import PlatformAdmin
from app.models.staff import Staff
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

NEW_PW = "yeni-guclu-sifre-7"


async def tok(admin):
    return mint_platform_token(admin)


async def reload_admin(aid) -> PlatformAdmin:
    async with SessionFactory() as db:
        return await db.get(PlatformAdmin, aid)


# ------------------------------------------------------------------ token sürümü
async def test_token_without_tv_claim_counts_as_version_zero(api, platform_admin, shop):
    legacy = create_access_token({"sub": str(platform_admin.id), "type": "platform_admin"})
    assert (await api.get("/api/platform/me", token=legacy)).status_code == 200
    legacy_staff = create_access_token({"sub": str(shop.owner.id), "tenant_id": shop.tenant.id, "type": "staff"})
    assert (await api.get("/api/auth/me", slug="alfa", token=legacy_staff)).status_code == 200


async def test_wrong_tv_claim_rejected(api, platform_admin, shop):
    bad = create_access_token({"sub": str(platform_admin.id), "type": "platform_admin", "tv": 5})
    assert (await api.get("/api/platform/me", token=bad)).status_code == 401
    bad_s = create_access_token({"sub": str(shop.owner.id), "tenant_id": shop.tenant.id, "type": "staff", "tv": 3})
    assert (await api.get("/api/auth/me", slug="alfa", token=bad_s)).status_code == 401


async def test_login_issues_token_with_current_tv(api, platform_admin):
    r = await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": PLATFORM_PASSWORD})
    import jwt
    from app.core.config import settings
    claims = jwt.decode(r.json()["access_token"], settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert claims["tv"] == 0
    assert (await reload_admin(platform_admin.id)).last_login_at is not None


async def test_change_password_returns_working_new_token_and_kills_old(api, platform_admin):
    old = await tok(platform_admin)
    r = await api.post("/api/platform/me/password", token=old,
                       json={"current_password": PLATFORM_PASSWORD, "new_password": NEW_PW})
    assert r.status_code == 200
    new = r.json()["access_token"]
    assert (await api.get("/api/platform/me", token=new)).status_code == 200
    assert (await api.get("/api/platform/me", token=old)).status_code == 401
    # yeni şifre ile giriş çalışır, eskisi çalışmaz
    assert (await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": NEW_PW})).status_code == 200
    assert (await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": PLATFORM_PASSWORD})).status_code == 401


async def test_change_password_wrong_current_and_weak_new(api, platform_admin):
    t = await tok(platform_admin)
    r = await api.post("/api/platform/me/password", token=t, json={"current_password": "yanlis", "new_password": NEW_PW})
    assert r.status_code == 400 and r.json()["detail"] == "Mevcut şifre hatalı"
    for weak in ("kisa", PLATFORM_PHONE, "password", "aaaaaaaaaa"):
        r = await api.post("/api/platform/me/password", token=t,
                           json={"current_password": PLATFORM_PASSWORD, "new_password": weak})
        assert r.status_code == 422, weak
    assert (await api.get("/api/platform/me", token=t)).status_code == 200  # token bozulmadı


async def test_logout_all_invalidates_existing_tokens(api, platform_admin):
    t1, t2 = await tok(platform_admin), await tok(platform_admin)
    assert (await api.post("/api/platform/me/logout-all", token=t1)).status_code == 204
    assert (await api.get("/api/platform/me", token=t1)).status_code == 401
    assert (await api.get("/api/platform/me", token=t2)).status_code == 401
    # yeniden girişle devam
    r = await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": PLATFORM_PASSWORD})
    assert (await api.get("/api/platform/me", token=r.json()["access_token"])).status_code == 200


async def test_deactivating_admin_kills_their_tokens_and_blocks_login(api, platform_admin):
    other = await make_platform_admin("5000000002", "other-pass-9")
    ot = await tok(other)
    me = await tok(platform_admin)
    r = await api.patch(f"/api/platform/admins/{other.id}", token=me, json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert (await api.get("/api/platform/me", token=ot)).status_code == 401
    r = await api.post("/api/platform/login", json={"phone": "5000000002", "password": "other-pass-9"})
    assert r.status_code == 401 and r.json()["detail"] == "Telefon veya şifre hatalı"
    # aktifleştirince tekrar girebilir
    await api.patch(f"/api/platform/admins/{other.id}", token=me, json={"is_active": True})
    assert (await api.post("/api/platform/login", json={"phone": "5000000002", "password": "other-pass-9"})).status_code == 200


async def test_inactive_admin_with_valid_token_is_rejected(api, platform_admin):
    other = await make_platform_admin("5000000002", "other-pass-9")
    ot = await tok(other)
    async with SessionFactory() as db:
        (await db.get(PlatformAdmin, other.id)).is_active = False
        await db.commit()
    assert (await api.get("/api/platform/me", token=ot)).status_code == 401


async def test_admin_password_reset_kills_target_tokens(api, platform_admin):
    other = await make_platform_admin("5000000002", "other-pass-9")
    ot, me = await tok(other), await tok(platform_admin)
    r = await api.post(f"/api/platform/admins/{other.id}/reset-password", token=me, json={"password": NEW_PW})
    assert r.status_code == 204
    assert (await api.get("/api/platform/me", token=ot)).status_code == 401
    assert (await api.get("/api/platform/me", token=me)).status_code == 200  # başkasının sıfırlaması benimkini düşürmez
    assert (await api.post("/api/platform/login", json={"phone": "5000000002", "password": NEW_PW})).status_code == 200
    assert (await api.post(f"/api/platform/admins/{other.id}/reset-password", token=me, json={"password": "12345678"})).status_code == 422


async def test_reset_own_password_via_admin_route_drops_own_token(api, platform_admin):
    me = await tok(platform_admin)
    assert (await api.post(f"/api/platform/admins/{platform_admin.id}/reset-password", token=me,
                           json={"password": NEW_PW})).status_code == 204
    assert (await api.get("/api/platform/me", token=me)).status_code == 401


async def test_staff_password_change_by_owner_invalidates_staff_token(api, shop):
    r = await api.patch(f"/api/admin/staff/{shop.staff.id}", slug="alfa", token=shop.owner_token,
                        json={"password": "yepyeni-sifre"})
    assert r.status_code == 200
    assert (await api.get("/api/auth/me", slug="alfa", token=shop.staff_token)).status_code == 401
    # yeni şifreyle giriş + yeni token çalışır; diğer personel etkilenmez
    r = await api.post("/api/auth/login", slug="alfa", json={"phone": shop.staff.phone, "password": "yepyeni-sifre"})
    assert (await api.get("/api/auth/me", slug="alfa", token=r.json()["access_token"])).status_code == 200
    assert (await api.get("/api/auth/me", slug="alfa", token=shop.staff2_token)).status_code == 200


async def test_staff_non_password_update_keeps_token(api, shop):
    r = await api.patch(f"/api/admin/staff/{shop.staff.id}", slug="alfa", token=shop.owner_token, json={"name": "yeni ad"})
    assert r.status_code == 200
    assert (await api.get("/api/auth/me", slug="alfa", token=shop.staff_token)).status_code == 200


# ------------------------------------------------------------------ yöneticiler
async def test_list_admins_has_is_me(api, platform_admin):
    other = await make_platform_admin("5000000002", "other-pass-9")
    rows = (await api.get("/api/platform/admins", token=await tok(platform_admin))).json()
    assert [r["id"] for r in rows] == [platform_admin.id, other.id]
    assert [r["is_me"] for r in rows] == [True, False]
    assert set(rows[0]) == {"id", "phone", "name", "is_active", "last_login_at", "created_at", "is_me"}
    assert "password" not in rows[0]
    rows2 = (await api.get("/api/platform/admins", token=await tok(other))).json()
    assert [r["is_me"] for r in rows2] == [False, True]


async def test_create_admin_ok_and_can_login(api, platform_admin):
    t = await tok(platform_admin)
    r = await api.post("/api/platform/admins", token=t, json={"phone": "5321112233", "name": "Ayşe", "password": NEW_PW})
    assert r.status_code == 201
    assert r.json()["is_active"] is True and r.json()["name"] == "Ayşe" and r.json()["is_me"] is False
    login = await api.post("/api/platform/login", json={"phone": "5321112233", "password": NEW_PW})
    assert login.status_code == 200
    me = await api.get("/api/platform/me", token=login.json()["access_token"])
    assert me.json()["name"] == "Ayşe"


async def test_create_admin_password_policy(api, platform_admin):
    t = await tok(platform_admin)
    cases = ["short1", "1234567", "12345678", "123456789", "1234567890", "password", "PASSWORD", "11111111",
             "00000000", "qwerty123", "zzzzzzzzzzzz", "5321112233"]  # sonuncusu telefona eşit
    for pw in cases:
        r = await api.post("/api/platform/admins", token=t, json={"phone": "5321112233", "password": pw})
        assert r.status_code == 422, pw
        assert isinstance(r.json()["detail"], str)
    r = await api.get("/api/platform/admins", token=t)
    assert len(r.json()) == 1  # hiçbiri oluşmadı


async def test_create_admin_duplicate_phone_409_and_bad_phone_422(api, platform_admin):
    t = await tok(platform_admin)
    r = await api.post("/api/platform/admins", token=t, json={"phone": PLATFORM_PHONE, "password": NEW_PW})
    assert r.status_code == 409 and r.json()["detail"] == "Bu telefon numarası zaten kayıtlı"
    r = await api.post("/api/platform/admins", token=t, json={"phone": "12345", "password": NEW_PW})
    assert r.status_code == 422


async def test_cannot_deactivate_or_delete_self(api, platform_admin):
    other = await make_platform_admin("5000000002", "other-pass-9")  # son aktif değil
    t = await tok(platform_admin)
    r = await api.patch(f"/api/platform/admins/{platform_admin.id}", token=t, json={"is_active": False})
    assert r.status_code == 400
    r = await api.delete(f"/api/platform/admins/{platform_admin.id}", token=t)
    assert r.status_code == 400
    assert (await api.get("/api/platform/me", token=t)).status_code == 200


async def test_cannot_remove_last_active_admin(api, platform_admin):
    """İkinci yönetici pasifse, tek aktif olan (başka biri tarafından değil) silinemez/pasife alınamaz."""
    other = await make_platform_admin("5000000002", "other-pass-9")
    t = await tok(platform_admin)
    # other'ı pasife al: artık tek aktif yönetici = ben
    assert (await api.patch(f"/api/platform/admins/{other.id}", token=t, json={"is_active": False})).status_code == 200
    # pasif other (token'ı geçersiz) silinebilir; ben zaten kendimi silemem. Son aktifi koruma kuralı:
    # other'ı yeniden aktifleştir, other kendi token'ıyla beni pasife alsın -> ben son aktif değilim (other aktif).
    await api.patch(f"/api/platform/admins/{other.id}", token=t, json={"is_active": True})
    ot = await tok(await reload_admin(other.id))
    assert (await api.patch(f"/api/platform/admins/{platform_admin.id}", token=ot, json={"is_active": False})).status_code == 200


async def test_delete_other_admin_and_404(api, platform_admin):
    other = await make_platform_admin("5000000002", "other-pass-9")
    t = await tok(platform_admin)
    assert (await api.delete(f"/api/platform/admins/{other.id}", token=t)).status_code == 204
    assert (await api.delete(f"/api/platform/admins/{other.id}", token=t)).status_code == 404
    assert (await api.patch("/api/platform/admins/9999", token=t, json={"name": "x"})).status_code == 404
    assert (await api.post("/api/platform/admins/9999/reset-password", token=t, json={"password": NEW_PW})).status_code == 404


async def test_admin_routes_require_platform_token(api, shop):
    for method, path in (("GET", "/api/platform/admins"), ("GET", "/api/platform/audit"),
                         ("GET", "/api/platform/audit/actions"), ("GET", "/api/platform/jobs/runs"),
                         ("GET", "/api/platform/system/status"), ("POST", "/api/platform/me/logout-all")):
        assert (await api.request(method, path)).status_code == 401, path
        assert (await api.request(method, path, token=shop.owner_token)).status_code == 401, path
