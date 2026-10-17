"""Platform sistem sağlığı: hata sayacı, sunucu durumu ve aksiyon kuyruğu uyarıları."""
import json
from datetime import datetime, timedelta

from fastapi import Request
from sqlalchemy import select, update

from app.core.database import SessionFactory
from app.main import unhandled_exception_handler
from app.models.error_event import ErrorEvent
from app.services import system_services
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


def fake_request(path="/api/x?token=gizli"):
    return Request({"type": "http", "method": "POST", "path": path.split("?")[0], "query_string": b"token=gizli", "headers": []})


async def test_unhandled_exception_is_recorded_without_query_and_returns_generic_500(api):
    resp = await unhandled_exception_handler(fake_request(), ValueError("beklenmedik"))
    assert resp.status_code == 500 and b"Beklenmeyen" in resp.body
    async with SessionFactory() as db:
        row = (await db.execute(select(ErrorEvent))).scalar_one()
    assert row.path == "/api/x" and "gizli" not in row.path  # sorgu parametresi (token) tutulmaz
    assert row.method == "POST" and row.error.startswith("ValueError")


async def test_system_status_exposes_errors_and_host_and_queue_warns(api, platform_admin, monkeypatch, tmp_path):
    tok = mint_platform_token(platform_admin)
    for _ in range(5):
        await unhandled_exception_handler(fake_request(), RuntimeError("x"))
    (tmp_path / "host_status.json").write_text(json.dumps({
        "at": datetime.now().isoformat(timespec="seconds"), "disk_used_pct": 91, "disk_free_gb": 3.2,
        "cert_days_left": 9, "cert_not_after": "2026-12-01"}))
    monkeypatch.setattr(system_services, "BACKUP_DIR", tmp_path)
    r = await api.get("/api/platform/system/status", token=tok)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["errors"]["last_hour"] == 5 and len(d["errors"]["recent"]) == 5
    assert d["host"]["disk_used_pct"] == 91 and d["host"]["cert_days_left"] == 9
    q = (await api.get("/api/platform/actions", token=tok)).json()
    titles = " | ".join(i["title"] for i in q["items"] if i["category"] == "system")
    assert "Disk %91" in titles and "Sertifika" in titles and "hata artışı" in titles and "yedek" in titles.lower()


async def test_old_errors_do_not_count_as_last_hour(api, platform_admin):
    await unhandled_exception_handler(fake_request(), RuntimeError("eski"))
    async with SessionFactory() as db:
        await db.execute(update(ErrorEvent).values(at=datetime.now() - timedelta(hours=5)))
        await db.commit()
    d = (await api.get("/api/platform/system/status", token=mint_platform_token(platform_admin))).json()
    assert d["errors"]["last_hour"] == 0 and d["errors"]["last_24h"] == 1
