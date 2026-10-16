"""Alembic: son migration geri/ileri çalışır; boş DB'den başlama sorunu (xfail ile belgelenmiş).
Yalnızca test veritabanlarında çalışır (adı '_test' ile biter)."""
import os
import subprocess
import sys
from pathlib import Path

import psycopg2
import pytest

BACKEND = Path(__file__).resolve().parent.parent
LATEST = "b0c1d2e3f4a5"


def alembic(url, *args):
    assert url.rsplit("/", 1)[-1].split("?")[0].endswith("_test")
    return subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=dict(os.environ, DATABASE_URL=url),
                          capture_output=True, text=True)


def current(url):
    return alembic(url, "current").stdout


def test_downgrade_one_and_upgrade_again_on_test_db():
    url = os.environ["DATABASE_URL"]
    assert alembic(url, "upgrade", "head").returncode == 0
    assert LATEST in current(url)
    down = alembic(url, "downgrade", "-1")
    assert down.returncode == 0, down.stderr[-1500:]
    assert LATEST not in current(url)
    up = alembic(url, "upgrade", "head")
    assert up.returncode == 0, up.stderr[-1500:]
    assert LATEST in current(url)
    # uçtan uca: şema gerçekten geri geldi
    dsn = url.replace("postgresql+asyncpg://", "postgresql://")
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("select count(*) from information_schema.tables where table_name in ('login_attempts','audit_logs','job_runs')")
        assert cur.fetchone()[0] == 3
        cur.execute("select column_name from information_schema.columns where table_name='staff' and column_name='token_version'")
        assert cur.fetchone() is not None


@pytest.mark.xfail(reason="BİLİNEN SORUN: ilk migration (7efb0e9dab46) tenant_settings'in zaten var olduğunu varsayar; "
                          "boş DB'de `alembic upgrade head` başarısız olur (schema.sql önce uygulanmalı).",
                   strict=False)
def test_upgrade_head_on_completely_empty_database():
    base = os.environ["DATABASE_URL"].rsplit("/", 1)[0].replace("postgresql+asyncpg://", "postgresql://")
    name = f"behtech_empty_{os.getpid()}_test"
    admin = psycopg2.connect(base + "/postgres")
    admin.autocommit = True
    try:
        with admin.cursor() as cur:
            cur.execute(f'CREATE DATABASE "{name}"')
        url = os.environ["DATABASE_URL"].rsplit("/", 1)[0] + "/" + name
        r = alembic(url, "upgrade", "head")
        assert r.returncode == 0, r.stderr[-300:]
    finally:
        with admin.cursor() as cur:
            cur.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        admin.close()
