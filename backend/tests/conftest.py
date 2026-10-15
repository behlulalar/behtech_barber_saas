"""Test altyapısı.

ÖNEMLİ: Ayarlar (pydantic-settings) uygulama import edilirken okunur; bu yüzden ortam değişkenleri
bu dosyanın EN ÜSTÜNDE, `app` import edilmeden önce ayarlanır. Test veritabanı adı `_test` ile bitmiyorsa
oturum hemen iptal edilir (geliştirme DB'sine yazmayı önlemek için).
"""
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
os.chdir(BACKEND_DIR)  # .env ve alembic.ini göreli yollarla okunur
sys.path.insert(0, str(BACKEND_DIR))

DEFAULT_TEST_URL = "postgresql+asyncpg://muhammedbehlulalar@localhost:5432/behtech_saas_test"
_url = os.environ.get("DATABASE_URL") or DEFAULT_TEST_URL
_db_name = _url.rsplit("/", 1)[-1].split("?")[0]
if not _db_name.endswith("_test"):
    raise SystemExit(f"GÜVENLİK: test DB adı '_test' ile bitmeli, bulunan: {_db_name!r}. Testler iptal edildi.")
os.environ["DATABASE_URL"] = _url
os.environ["ENVIRONMENT"] = "development"
os.environ["OTP_FIXED_CODE"] = ""  # boş: rastgele OTP
os.environ["DAILY_APPOINTMENT_LIMIT"] = "50"
os.environ["BASE_DOMAIN"] = "behtechlabs.com"
# .env yoksa bile ayarlar yüklensin (varsa .env değerleri yine de ortam değişkeninden sonra gelir)
for _k, _v in {
    "JWT_SECRET": "test-secret-not-for-production-use-0123456789",
    "JWT_ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "60",
    "OTP_EXPIRATION_SECONDS": "120",
    "BACKUP_RETENTION_DAYS": "7",
    "EVOLUTION_API_BASE_URL": "http://127.0.0.1:9",
    "EVOLUTION_API_KEY": "x",
    "EVOLUTION_INSTANCE_NAME": "x",
}.items():
    os.environ.setdefault(_k, _v)

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import engine  # noqa: E402

assert settings.database_url.rsplit("/", 1)[-1].split("?")[0].endswith("_test"), "test DB değil!"
assert settings.environment == "development"

from tests.factories import *  # noqa: E402,F401,F403
from tests.helpers import *  # noqa: E402,F401,F403

_PS_DEFAULTS: dict = {}
KEEP_TABLES = {"alembic_version", "platform_settings"}  # migration ile tohumlanan tek satırlık ayar tablosu


def pytest_sessionstart(session):
    """Şemayı hazırlar (run_tests.sh zaten yapar; doğrudan `pytest` için güvence)."""
    from tests.bootstrap_db import bootstrap

    bootstrap(os.environ["DATABASE_URL"])


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    """Her testten önce tüm uygulama tabloları boşaltılır (yeni eklenen tablolar otomatik dahil)."""
    async with engine.begin() as conn:
        rows = await conn.execute(text("select tablename from pg_tables where schemaname='public'"))
        tables = [r[0] for r in rows if r[0] not in KEEP_TABLES]
        if tables:
            names = ", ".join(f'"{t}"' for t in tables)
            await conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
        # platform_settings truncate edilmez; ilk halini her testte geri yükle (testler ayarı değiştirebilir)
        cols = ["iban", "account_holder", "bank_name", "reminder_days", "grace_days", "notify_email",
                "reminder_template", "overdue_template"]
        if not _PS_DEFAULTS:
            import importlib.util
            spec = importlib.util.spec_from_file_location("billing_migration", BACKEND_DIR / "alembic/versions/c8d9e0f1a2b3_billing.py")
            mig = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mig)
            _PS_DEFAULTS.update(iban=None, account_holder=None, bank_name=None, notify_email=None, reminder_days=3,
                                grace_days=7, reminder_template=mig.REMINDER_TEMPLATE, overdue_template=mig.OVERDUE_TEMPLATE)
        sets = ", ".join(f"{c} = :{c}" for c in cols)
        await conn.execute(text(f"update platform_settings set {sets} where id=1"), dict(_PS_DEFAULTS))
    yield


@pytest.fixture(autouse=True)
def no_external_notifications(monkeypatch):
    """Testler asla gerçek e-posta / push / WhatsApp göndermemeli."""
    for name in ("smtp_host", "smtp_from", "vapid_public_key", "vapid_private_key"):
        monkeypatch.setattr(settings, name, None)


@pytest_asyncio.fixture
async def shop():
    return await make_shop("alfa")


@pytest_asyncio.fixture
async def shop2():
    return await make_shop("beta")


@pytest_asyncio.fixture
async def platform_admin():
    return await make_platform_admin()


@pytest_asyncio.fixture
async def api():
    """Host header'ı ve token'ı isteğe göre verilen in-process ASGI istemcisi."""
    client = ApiClient()
    yield client
    await client.aclose()
