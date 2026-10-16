"""Üretim/yeni kurulum veritabanını hazırlar. Boşsa schema.sql'i uygular (alembic zinciri BOŞ veritabanından başlayamaz:
ilk migration 'tenant_settings' tablosunu zaten var sayar), sonra `alembic upgrade head`. İdempotent: dolu veritabanında
yalnızca eksik migration'ları uygular.

Kullanım (konteyner içinde): python scripts/bootstrap_db.py
"""
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import psycopg2  # noqa: E402

from app.core.config import settings  # noqa: E402


def main() -> int:
    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = psycopg2.connect(dsn)
    try:
        with conn, conn.cursor() as cur:
            cur.execute("select to_regclass('public.tenants')")
            if cur.fetchone()[0] is None:
                print("Boş veritabanı: schema.sql uygulanıyor")
                cur.execute((BACKEND_DIR / "schema.sql").read_text())
            else:
                print("Şema mevcut: schema.sql atlandı")
    finally:
        conn.close()
    r = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND_DIR)
    return r.returncode


if __name__ == "__main__":
    raise SystemExit(main())
