"""Sistem durumu: veritabanı, günlük kontrol, yedek, bildirim kanalları ve sayaçlar."""
import json
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.job_run import JobRun
from app.models.login_attempt import LoginAttempt
from app.models.platform_admin import PlatformAdmin
from app.models.push_subscription import PushSubscription
from app.models.tenant import Tenant
from app.schemas.platform import (
    BackupStatus, BillingJobStatus, ChannelsStatus, CountsStatus, DbStatus, SystemStatus,
)
from app.services import notify_services
from app.services.job_services import BILLING_JOB, job_run_out

BACKUP_DIR = Path(__file__).resolve().parent.parent.parent / "backups"
STALE_HOURS = 26  # günlük iş + yedek: 24 saat + tolerans


def _read_json(name: str) -> dict | None:
    try:
        return json.loads((BACKUP_DIR / name).read_text())
    except (OSError, ValueError):
        return None


def _parse(ts: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(ts) if ts else None
    except ValueError:
        return None


def whatsapp_configured() -> bool:
    return bool(settings.evolution_api_base_url and settings.evolution_api_key and settings.evolution_instance_name)


async def _whatsapp_reachable() -> bool | None:
    if not whatsapp_configured():
        return None
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.get(settings.evolution_api_base_url)
        return True  # herhangi bir HTTP yanıtı: sunucu ayakta
    except Exception:
        return False


async def get_status(db: AsyncSession) -> SystemStatus:
    now = datetime.now()
    day_ago = now - timedelta(hours=24)

    try:
        size = (await db.execute(text("SELECT pg_database_size(current_database())"))).scalar_one()
        db_status = DbStatus(ok=True, size_mb=round(size / 1024 / 1024, 2))
    except Exception:
        db_status = DbStatus(ok=False, size_mb=0.0)

    last_run = (await db.execute(
        select(JobRun).where(JobRun.job == BILLING_JOB).order_by(JobRun.started_at.desc(), JobRun.id.desc()).limit(1)
    )).scalar_one_or_none()
    last_ok = (await db.execute(
        select(func.max(JobRun.finished_at)).where(JobRun.job == BILLING_JOB, JobRun.ok == True)  # noqa: E712
    )).scalar_one()
    hours_ok = round((now - last_ok).total_seconds() / 3600, 1) if last_ok else None
    billing_job = BillingJobStatus(
        last_run=job_run_out(last_run) if last_run else None, last_ok_at=last_ok,
        hours_since_last_ok=hours_ok, overdue=hours_ok is None or hours_ok > STALE_HOURS,
    )

    b = _read_json("last_backup.json") or {}
    v = _read_json("last_verify.json") or {}
    backup_at = _parse(b.get("at"))
    age = round((now - backup_at).total_seconds() / 3600, 1) if backup_at else None
    backup = BackupStatus(
        last_backup_at=backup_at, file=b.get("file"),
        size_mb=round(b["size_bytes"] / 1024 / 1024, 2) if b.get("size_bytes") is not None else None,
        age_hours=age, ok=age is not None and age < STALE_HOURS,
        verified_at=_parse(v.get("at")), verified_ok=v.get("ok") if v else None,
    )

    subscribers = (await db.execute(select(func.count(PushSubscription.id)))).scalar_one()
    channels = ChannelsStatus(
        email_configured=notify_services.email_configured(), push_configured=notify_services.push_configured(),
        push_subscribers=subscribers, whatsapp_configured=whatsapp_configured(),
        whatsapp_reachable=await _whatsapp_reachable(),
    )

    async def count(q) -> int:
        return (await db.execute(q)).scalar_one()

    counts = CountsStatus(
        tenants=await count(select(func.count(Tenant.id))),
        active_tenants=await count(select(func.count(Tenant.id)).where(Tenant.is_active == True)),  # noqa: E712
        platform_admins=await count(select(func.count(PlatformAdmin.id))),
        audit_logs_last_24h=await count(select(func.count(AuditLog.id)).where(AuditLog.created_at > day_ago)),
        failed_logins_last_24h=await count(
            select(func.count(LoginAttempt.id)).where(LoginAttempt.success == False, LoginAttempt.created_at > day_ago)  # noqa: E712
        ),
    )
    return SystemStatus(server_time=now, db=db_status, billing_job=billing_job, backup=backup,
                        channels=channels, counts=counts)
