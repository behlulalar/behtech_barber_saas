"""Platform giriş geçmişi: hatalı deneme kaydı ve yeni adres işareti."""
from sqlalchemy import select

from app.core.database import SessionFactory
from app.models.audit_log import AuditLog
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


async def logs(action):
    async with SessionFactory() as db:
        return (await db.execute(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id))).scalars().all()


async def login(api, phone, password, ip="10.0.0.1"):
    return await api.post("/api/platform/login", json={"phone": phone, "password": password}, headers={"x-forwarded-for": ip})


async def test_failed_login_for_existing_admin_is_recorded_but_unknown_number_is_not(api, platform_admin):
    assert (await login(api, PLATFORM_PHONE, "yanlis-sifre")).status_code == 401
    assert (await login(api, "5999999999", "yanlis-sifre")).status_code == 401  # var olmayan numara: kayıt yok
    rows = await logs("platform.login_failed")
    assert len(rows) == 1 and rows[0].entity_id == platform_admin.id and PLATFORM_PHONE in rows[0].summary


async def test_new_ip_is_flagged_only_after_first_login(api, platform_admin, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    assert (await login(api, PLATFORM_PHONE, PLATFORM_PASSWORD, ip="10.0.0.1")).status_code == 200
    assert (await login(api, PLATFORM_PHONE, PLATFORM_PASSWORD, ip="10.0.0.1")).status_code == 200  # aynı adres
    assert (await login(api, PLATFORM_PHONE, PLATFORM_PASSWORD, ip="10.0.0.9")).status_code == 200  # yeni adres
    rows = await logs("platform.login")
    assert [r.details["new_ip"] for r in rows] == [False, False, True]  # ilk giriş yeni sayılmaz
    assert "yeni adresten" in rows[2].summary and "yeni adresten" not in rows[0].summary
