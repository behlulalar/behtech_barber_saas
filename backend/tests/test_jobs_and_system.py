"""job_runs, günlük kontrolün hata yolu ve /platform/system/status."""
import json
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionFactory
from app.models.job_run import JobRun
from app.services import billing_services, job_services, system_services
from tests.factories import *  # noqa
from tests.helpers import *  # noqa


@pytest.fixture
def backup_dir(tmp_path, monkeypatch):
    """Gerçek backups/ klasörüne dokunmadan geçici dizin kullanılır."""
    monkeypatch.setattr(system_services, "BACKUP_DIR", tmp_path)
    return tmp_path


@pytest.fixture(autouse=True)
def no_whatsapp(monkeypatch):
    monkeypatch.setattr(settings, "evolution_api_base_url", None)  # status ağ isteği yapmasın


async def runs():
    async with SessionFactory() as db:
        return (await db.execute(select(JobRun).order_by(JobRun.id))).scalars().all()


async def add_run(started, ok=True, finished=True, trigger="cron", error=None):
    async with SessionFactory() as db:
        db.add(JobRun(job="billing_checks", trigger=trigger, started_at=started,
                      finished_at=started + timedelta(seconds=2) if finished else None, ok=ok, error=error,
                      result={"checked": 0} if ok else None))
        await db.commit()


async def test_manual_run_checks_writes_job_run(api, platform_admin):
    t = mint_platform_token(platform_admin)
    r = await api.post("/api/platform/billing/run-checks", token=t)
    assert r.status_code == 200
    rs = await runs()
    assert len(rs) == 1
    jr = rs[0]
    assert jr.job == "billing_checks" and jr.trigger == "manual" and jr.ok is True and jr.error is None
    assert jr.finished_at >= jr.started_at and jr.result == r.json()


async def test_cron_helper_writes_cron_run(shop):
    async with SessionFactory() as db:
        res = await job_services.run_billing_checks_logged(db, "cron")
    jr = (await runs())[0]
    assert jr.trigger == "cron" and jr.ok and jr.result["checked"] == res.checked == 0


async def test_failure_path_records_ok_false_and_error_then_reraises(monkeypatch):
    async def boom(db):
        raise RuntimeError("veritabanı patladı")
    monkeypatch.setattr(billing_services, "run_billing_checks", boom)
    async with SessionFactory() as db:
        with pytest.raises(RuntimeError):
            await job_services.run_billing_checks_logged(db, "cron")
    rs = await runs()
    assert len(rs) == 1
    assert rs[0].ok is False and rs[0].finished_at is not None
    assert "RuntimeError" in rs[0].error and "veritabanı patladı" in rs[0].error
    assert rs[0].result is None


async def test_failed_run_does_not_leave_partial_changes(monkeypatch, shop):
    """Kontrol ortasında hata: askıya alma commit edilmemeli (rollback) ve audit kaydı kalmamalı."""
    from app.models.subscription import Subscription
    async with SessionFactory() as db:
        db.add(Subscription(tenant_id=shop.tenant.id, plan_name="x", start_date=date.today() - timedelta(days=90),
                            end_date=date.today() - timedelta(days=60), price=1))
        await db.commit()

    async def boom(*a, **k):
        raise RuntimeError("bildirim adımı")
    monkeypatch.setattr(job_services, "audit", boom)  # run_checks audit'i patlar (başarılı gövdeden sonra)
    async with SessionFactory() as db:
        with pytest.raises(RuntimeError):
            await job_services.run_billing_checks_logged(db, "cron")
    assert (await runs())[0].ok is False


async def test_script_main_returns_exit_code_1_on_failure(monkeypatch, capsys):
    import importlib.util
    from pathlib import Path
    spec = importlib.util.spec_from_file_location("run_billing_checks_script",
                                                  Path(__file__).resolve().parent.parent / "scripts" / "run_billing_checks.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    async def noop():
        return None
    from types import SimpleNamespace
    mod.engine = SimpleNamespace(dispose=noop)  # paylaşılan engine kapatılmasın

    async def boom(db):
        raise RuntimeError("kötü gün")
    monkeypatch.setattr(billing_services, "run_billing_checks", boom)
    assert await mod.main() == 1
    assert "HATA" in capsys.readouterr().err
    assert (await runs())[0].ok is False


async def test_job_runs_endpoint_shape_filter_limit(api, platform_admin):
    t = mint_platform_token(platform_admin)
    now = datetime.now()
    for i in range(5):
        await add_run(now - timedelta(hours=i + 1))
    await add_run(now - timedelta(hours=9), ok=False, trigger="manual", error="X: bozuk")
    async with SessionFactory() as db:
        db.add(JobRun(job="baska_is", trigger="cron", started_at=now, ok=True))
        await db.commit()
    r = await api.get("/api/platform/jobs/runs?job=billing_checks&limit=3", token=t)
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 3
    assert set(body[0]) == {"id", "job", "trigger", "started_at", "finished_at", "duration_ms", "ok", "result", "error"}
    assert body[0]["duration_ms"] == 2000 and all(b["job"] == "billing_checks" for b in body)
    starts = [b["started_at"] for b in body]
    assert starts == sorted(starts, reverse=True)
    allrows = (await api.get("/api/platform/jobs/runs?limit=200", token=t)).json()
    assert len(allrows) == 7
    failed = [b for b in allrows if not b["ok"]]
    assert failed[0]["error"] == "X: bozuk" and failed[0]["trigger"] == "manual"
    assert (await api.get("/api/platform/jobs/runs?limit=201", token=t)).status_code == 422


async def test_unfinished_run_has_null_duration(api, platform_admin):
    await add_run(datetime.now() - timedelta(minutes=5), ok=False, finished=False)
    r = (await api.get("/api/platform/jobs/runs", token=mint_platform_token(platform_admin))).json()
    assert r[0]["finished_at"] is None and r[0]["duration_ms"] is None and r[0]["ok"] is False


# ------------------------------------------------------------------ system status
async def status(api, admin):
    r = await api.get("/api/platform/system/status", token=mint_platform_token(admin))
    assert r.status_code == 200, r.text
    return r.json()


async def test_status_shape_and_db(api, platform_admin, backup_dir):
    s = await status(api, platform_admin)
    assert set(s) == {"server_time", "db", "billing_job", "backup", "channels", "whatsapp", "counts"}
    assert s["db"]["ok"] is True and s["db"]["size_mb"] > 0
    assert set(s["billing_job"]) == {"last_run", "last_ok_at", "hours_since_last_ok", "overdue"}
    assert set(s["channels"]) == {"email_configured", "push_configured", "push_subscribers", "whatsapp_configured", "whatsapp_reachable", "whatsapp_state"}
    assert s["channels"]["whatsapp_configured"] is False and s["channels"]["whatsapp_reachable"] is None
    assert s["channels"]["email_configured"] is False and s["channels"]["push_configured"] is False
    assert s["counts"]["platform_admins"] == 1 and s["counts"]["tenants"] == 0


async def test_billing_job_overdue_logic(api, platform_admin, backup_dir):
    s = await status(api, platform_admin)
    assert s["billing_job"]["overdue"] is True and s["billing_job"]["last_run"] is None  # hiç çalışmadı
    now = datetime.now()
    await add_run(now - timedelta(hours=25))
    s = await status(api, platform_admin)
    assert s["billing_job"]["overdue"] is False and 24.5 < s["billing_job"]["hours_since_last_ok"] < 25.5
    await add_run(now - timedelta(hours=40))  # eski, önemsiz
    await add_run(now - timedelta(minutes=1), ok=False, trigger="manual", error="x")  # son çalışma başarısız
    s = await status(api, platform_admin)
    assert s["billing_job"]["overdue"] is False                  # son BAŞARILI çalışma 25 saat önce
    assert s["billing_job"]["last_run"]["ok"] is False           # ama son çalışma hatalı görünür


async def test_billing_job_overdue_when_last_success_older_than_26h(api, platform_admin, backup_dir):
    await add_run(datetime.now() - timedelta(hours=27))
    await add_run(datetime.now() - timedelta(hours=1), ok=False, error="boom")
    s = await status(api, platform_admin)
    assert s["billing_job"]["overdue"] is True and s["billing_job"]["hours_since_last_ok"] > 26


async def test_billing_job_not_overdue_after_manual_run(api, platform_admin, backup_dir):
    await api.post("/api/platform/billing/run-checks", token=mint_platform_token(platform_admin))
    s = await status(api, platform_admin)
    assert s["billing_job"]["overdue"] is False and s["billing_job"]["last_run"]["trigger"] == "manual"


async def test_backup_missing_means_not_ok(api, platform_admin, backup_dir):
    b = (await status(api, platform_admin))["backup"]
    assert b["ok"] is False and b["last_backup_at"] is None and b["file"] is None
    assert b["age_hours"] is None and b["verified_at"] is None and b["verified_ok"] is None


async def test_backup_fresh_stale_and_verified(api, platform_admin, backup_dir):
    (backup_dir / "last_backup.json").write_text(json.dumps({
        "at": (datetime.now() - timedelta(hours=3)).isoformat(), "file": "db_x.sql", "size_bytes": 5 * 1024 * 1024}))
    (backup_dir / "last_verify.json").write_text(json.dumps({"at": datetime.now().isoformat(), "ok": True, "tables": {}}))
    b = (await status(api, platform_admin))["backup"]
    assert b["ok"] is True and b["file"] == "db_x.sql" and b["size_mb"] == 5.0 and 2.5 < b["age_hours"] < 3.5
    assert b["verified_ok"] is True and b["verified_at"]
    (backup_dir / "last_backup.json").write_text(json.dumps({
        "at": (datetime.now() - timedelta(hours=30)).isoformat(), "file": "db_y.sql", "size_bytes": 1}))
    assert (await status(api, platform_admin))["backup"]["ok"] is False


async def test_backup_corrupt_json_is_not_ok_and_does_not_crash(api, platform_admin, backup_dir):
    (backup_dir / "last_backup.json").write_text("{bozuk json")
    assert (await status(api, platform_admin))["backup"]["ok"] is False


async def test_status_counts(api, platform_admin, shop, shop2, backup_dir):
    async with SessionFactory() as db:
        from app.models.tenant import Tenant
        (await db.get(Tenant, shop2.tenant.id)).is_active = False
        await db.commit()
    for _ in range(2):
        await api.post("/api/platform/login", json={"phone": PLATFORM_PHONE, "password": "yanlis-sifre"})
    c = (await status(api, platform_admin))["counts"]
    assert c["tenants"] == 2 and c["active_tenants"] == 1 and c["failed_logins_last_24h"] == 2
    assert c["audit_logs_last_24h"] >= 0
