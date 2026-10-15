"""Test DB'sini hazırlar: boşsa schema.sql uygular (alembic zinciri boş DB'den başlayamaz: ilk migration
'tenant_settings' tablosunu zaten var sayar), sonra `alembic upgrade head`.

Kullanım: DATABASE_URL=...behtech_saas_test python -m tests.bootstrap_db
"""
import os
import subprocess
import sys
from pathlib import Path

import psycopg2

BACKEND_DIR = Path(__file__).resolve().parent.parent


def bootstrap(url: str) -> None:
    name = url.rsplit("/", 1)[-1].split("?")[0]
    if not name.endswith("_test"):
        raise SystemExit(f"GÜVENLİK: '{name}' bir test DB'si değil.")
    dsn = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")
    conn = psycopg2.connect(dsn)
    try:
        with conn, conn.cursor() as cur:
            cur.execute("select to_regclass('public.tenants')")
            if cur.fetchone()[0] is None:
                cur.execute((BACKEND_DIR / "schema.sql").read_text())
    finally:
        conn.close()
    env = dict(os.environ, DATABASE_URL=url)
    r = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND_DIR, env=env,
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"alembic upgrade head başarısız:\n{r.stderr[-3000:]}")


if __name__ == "__main__":
    bootstrap(os.environ["DATABASE_URL"])
