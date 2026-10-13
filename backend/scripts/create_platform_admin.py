"""Create (or reset the password of) a platform admin.

Usage: .venv/bin/python scripts/create_platform_admin.py --phone 5000000000 --password 'secret123'
"""
import argparse
import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: E402,F401  (register all mappers)
from app.core.database import SessionFactory, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.platform_admin import PlatformAdmin  # noqa: E402


async def upsert_platform_admin(phone: str, password: str) -> str:
    async with SessionFactory() as db:
        admin = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.phone == phone))).scalar_one_or_none()
        if admin is None:
            db.add(PlatformAdmin(phone=phone, password=hash_password(password)))
            await db.commit()
            return "created"
        admin.password = hash_password(password)
        await db.commit()
        return "password updated"


async def main(phone: str, password: str) -> None:
    status = await upsert_platform_admin(phone, password)
    await engine.dispose()
    print(f"Platform admin {phone}: {status}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phone", required=True, help="10 digits, starts with 5 (e.g. 5000000000)")
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"5\d{9}", args.phone):
        parser.error("phone must match ^5\\d{9}$")
    if len(args.password) < 6:
        parser.error("password must be at least 6 characters")
    asyncio.run(main(args.phone, args.password))
