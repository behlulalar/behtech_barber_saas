"""Standalone billing check job, meant to run via cron daily (not part of the FastAPI app).

Usage: .venv/bin/python scripts/run_billing_checks.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionFactory, engine
from app.services.billing_services import run_billing_checks


async def main() -> None:
    try:
        async with SessionFactory() as db:
            r = await run_billing_checks(db)
    finally:
        await engine.dispose()
    print(
        f"checked={r.checked} notified={r.notified} suspended={r.suspended} "
        f"reactivated={r.reactivated} email_sent={r.email_sent} push_sent={r.push_sent}"
    )


if __name__ == "__main__":
    asyncio.run(main())
