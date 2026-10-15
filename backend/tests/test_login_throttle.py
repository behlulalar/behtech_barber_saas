"""Giriş denemesi sınırı (brute force): platform ve personel girişi."""
from datetime import datetime

import pytest
from sqlalchemy import func, select, text

from app.core.database import SessionFactory
from app.models.login_attempt import LoginAttempt
from tests.factories import *  # noqa
from tests.helpers import *  # noqa

BAD = "yanlis-sifre-1"
MSG = "Telefon veya şifre hatalı"


async def plat_login(api, phone=PLATFORM_PHONE, password=PLATFORM_PASSWORD):
    return await api.post("/api/platform/login", json={"phone": phone, "password": password})


async def staff_login(api, shop, phone=None, password=PASSWORD):
    return await api.post("/api/auth/login", slug=shop.slug, json={"phone": phone or shop.owner.phone, "password": password})


async def n_attempts(**filters):
    async with SessionFactory() as db:
        q = select(func.count()).select_from(LoginAttempt)
        for k, v in filters.items():
            q = q.where(getattr(LoginAttempt, k) == v)
        return (await db.execute(q)).scalar_one()


async def age_attempts(minutes):
    async with SessionFactory() as db:
        await db.execute(text(f"update login_attempts set created_at = created_at - interval '{minutes} minutes'"))
        await db.commit()


@pytest.fixture(params=["platform", "staff"])
def flow(request, api, shop, platform_admin):
    """Aynı senaryoları iki giriş akışında çalıştırır: (login_fn, phone, good_password, bad_phone_fn)."""
    if request.param == "platform":
        async def login(phone=None, password=PLATFORM_PASSWORD):
            return await plat_login(api, phone or PLATFORM_PHONE, password)
        return login, PLATFORM_PHONE, PLATFORM_PASSWORD
    async def login(phone=None, password=PASSWORD):
        return await staff_login(api, shop, phone, password)
    return login, shop.owner.phone, PASSWORD


async def test_four_failures_401_fifth_is_429_with_retry_after(flow):
    login, phone, good = flow
    for _ in range(4):
        r = await login(phone, BAD)
        assert r.status_code == 401 and r.json()["detail"] == MSG
    r = await login(phone, BAD)  # 5. yanlış kilidi tetikler
    assert r.status_code == 429
    assert "Çok fazla hatalı giriş denemesi" in r.json()["detail"] and "15 dakika" in r.json()["detail"]
    assert int(r.headers["Retry-After"]) >= 14 * 60


async def test_locked_account_rejects_correct_password_too(flow):
    login, phone, good = flow
    for _ in range(5):
        await login(phone, BAD)
    r = await login(phone, good)
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0


async def test_lock_is_per_phone(flow, shop):
    login, phone, good = flow
    for _ in range(5):
        await login(phone, BAD)
    assert (await login(phone, good)).status_code == 429
    # başka (var olan) kullanıcı etkilenmez
    if phone == PLATFORM_PHONE:
        await make_platform_admin("5000000002", "other-pass-9")
        assert (await login("5000000002", "other-pass-9")).status_code == 200
    else:
        assert (await login(shop.staff.phone, PASSWORD)).status_code == 200


async def test_lock_expires_after_window(flow):
    login, phone, good = flow
    for _ in range(5):
        await login(phone, BAD)
    assert (await login(phone, good)).status_code == 429
    await age_attempts(16)
    assert (await login(phone, good)).status_code == 200


async def test_remaining_minutes_shrinks_as_time_passes(flow):
    login, phone, good = flow
    for _ in range(5):
        await login(phone, BAD)
    await age_attempts(10)
    r = await login(phone, good)
    assert r.status_code == 429 and "5 dakika" in r.json()["detail"]
    assert int(r.headers["Retry-After"]) <= 5 * 60


async def test_success_clears_previous_failures(flow):
    login, phone, good = flow
    for _ in range(3):
        await login(phone, BAD)
    assert await n_attempts(success=False) == 3
    assert (await login(phone, good)).status_code == 200
    assert await n_attempts(success=False) == 0
    # sayaç sıfırlandı: tekrar 4 yanlış hâlâ 401
    for _ in range(4):
        assert (await login(phone, BAD)).status_code == 401


async def test_unknown_phone_counts_and_message_does_not_leak(flow):
    login, phone, good = flow
    ghost = "5009990001"
    first = await login(ghost, BAD)
    assert first.status_code == 401 and first.json()["detail"] == MSG
    assert (await login(phone, BAD)).json()["detail"] == MSG
    for _ in range(3):
        await login(ghost, BAD)
    r = await login(ghost, BAD)  # 5. deneme
    assert r.status_code == 429
    assert (await login(ghost, BAD)).status_code == 429


async def test_staff_key_is_tenant_specific(api, shop, shop2):
    """Aynı telefon iki işletmede: birinde kilitlenmek diğerini kilitlemez."""
    for _ in range(5):
        await staff_login(api, shop, shop.owner.phone, BAD)
    assert (await staff_login(api, shop, shop.owner.phone)).status_code == 429
    r = await staff_login(api, shop2, shop2.owner.phone)  # aynı telefon numarası, farklı tenant
    assert shop.owner.phone == shop2.owner.phone and r.status_code == 200


async def test_ip_threshold_locks_even_fresh_phones(api, platform_admin):
    ip = "127.0.0.1"
    async with SessionFactory() as db:
        for i in range(30):
            db.add(LoginAttempt(scope="platform", key=f"50000{i:05d}", ip=ip, success=False, created_at=datetime.now()))
        await db.commit()
    # 30 hata sınırı aşmıyor ("30'dan fazla"): henüz 401
    r = await plat_login(api, "5001112233", BAD)
    assert r.status_code == 401
    # şimdi 31 hata var: yeni bir telefon ve DOĞRU şifre bile kilitli
    r = await plat_login(api)
    assert r.status_code == 429


async def test_ip_failures_older_than_window_ignored(api, platform_admin):
    async with SessionFactory() as db:
        for i in range(40):
            db.add(LoginAttempt(scope="platform", key=f"50000{i:05d}", ip="127.0.0.1", success=False, created_at=datetime.now()))
        await db.commit()
    await age_attempts(20)
    assert (await plat_login(api)).status_code == 200


async def test_old_attempt_rows_are_pruned(api, platform_admin):
    async with SessionFactory() as db:
        db.add(LoginAttempt(scope="platform", key="5009990000", ip="1.2.3.4", success=False,
                            created_at=datetime(2020, 1, 1)))
        await db.commit()
    await plat_login(api, PLATFORM_PHONE, BAD)
    assert await n_attempts(key="5009990000") == 0


async def test_x_forwarded_for_ignored_by_default(api, platform_admin):
    """TRUST_PROXY_HEADERS=false iken sahte X-Forwarded-For ile IP sınırı atlatılamaz/yönlendirilemez."""
    r = await api.post("/api/platform/login", headers={"X-Forwarded-For": "9.9.9.9"},
                       json={"phone": PLATFORM_PHONE, "password": BAD})
    assert r.status_code == 401
    async with SessionFactory() as db:
        ip = (await db.execute(select(LoginAttempt.ip))).scalar_one()
    assert ip != "9.9.9.9"


async def test_x_forwarded_for_used_when_trusted(api, platform_admin, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    await api.post("/api/platform/login", headers={"X-Forwarded-For": "9.9.9.9, 10.0.0.1"},
                   json={"phone": PLATFORM_PHONE, "password": BAD})
    async with SessionFactory() as db:
        assert (await db.execute(select(LoginAttempt.ip))).scalar_one() == "9.9.9.9"
