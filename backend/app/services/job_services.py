"""Zamanlanmış işlerin kaydı (job_runs). API (manual) ve cron script'i (cron) aynı sarmalayıcıyı kullanır."""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job_run import JobRun
from app.models.platform_admin import PlatformAdmin
from app.schemas.billing import RunChecksResult
from app.schemas.platform import JobRunOut
from app.services import billing_services
from app.services.audit_services import audit

BILLING_JOB = "billing_checks"


def job_run_out(r: JobRun) -> JobRunOut:
    duration = int((r.finished_at - r.started_at).total_seconds() * 1000) if r.finished_at else None
    return JobRunOut(
        id=r.id, job=r.job, trigger=r.trigger, started_at=r.started_at, finished_at=r.finished_at,
        duration_ms=duration, ok=r.ok, result=r.result, error=r.error,
    )


async def run_billing_checks_logged(
    db: AsyncSession, trigger: str, actor: PlatformAdmin | None = None, request=None
) -> RunChecksResult:
    """Günlük kontrolü çalıştırır ve job_runs'a yazar. Hata olursa ok=false + error yazılır ve hata yeniden fırlatılır."""
    run = JobRun(job=BILLING_JOB, trigger=trigger, started_at=datetime.now(), ok=False)
    db.add(run)
    # Başlangıçta commit: süreç ortada ölse bile "bitmemiş çalışma" izi kalır.
    await db.commit()
    run_id = run.id
    try:
        result = await billing_services.run_billing_checks(db)
        await audit(
            db, actor=actor, request=request, action="billing.run_checks",
            summary=(
                f"Günlük kontrol çalıştı: {result.checked} işletme kontrol edildi, "
                f"{len(result.suspended)} askıya alındı, {len(result.reactivated)} yeniden açıldı"
            ),
            details={"trigger": trigger, **result.model_dump()},
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        run = (await db.execute(select(JobRun).where(JobRun.id == run_id))).scalar_one()
        run.finished_at = datetime.now()
        run.ok = False
        run.error = f"{type(exc).__name__}: {exc}"[:2000]
        await db.commit()
        raise
    run = (await db.execute(select(JobRun).where(JobRun.id == run_id))).scalar_one()
    run.finished_at = datetime.now()
    run.ok = True
    run.result = result.model_dump()
    await db.commit()
    return result


async def list_runs(db: AsyncSession, job: str | None, limit: int) -> list[JobRunOut]:
    q = select(JobRun)
    if job:
        q = q.where(JobRun.job == job)
    rows = (await db.execute(q.order_by(JobRun.started_at.desc(), JobRun.id.desc()).limit(limit))).scalars().all()
    return [job_run_out(r) for r in rows]
