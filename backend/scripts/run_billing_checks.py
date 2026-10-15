"""Standalone billing check job, meant to run via cron daily (not part of the FastAPI app).

Her çalışma job_runs tablosuna yazılır (trigger='cron'); hata olursa ok=false + error ve çıkış kodu 1.

Usage: .venv/bin/python scripts/run_billing_checks.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.models  # noqa: E402,F401  (register all mappers)
from app.core.database import SessionFactory, engine  # noqa: E402
from app.services.job_services import run_billing_checks_logged  # noqa: E402


async def main() -> int:
    try:
        async with SessionFactory() as db:
            r = await run_billing_checks_logged(db, "cron")
    except Exception as exc:
        print(f"HATA: günlük kontrol başarısız: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()
    print(
        f"checked={r.checked} notified={r.notified} suspended={r.suspended} "
        f"reactivated={r.reactivated} email_sent={r.email_sent} push_sent={r.push_sent}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
