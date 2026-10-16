"""Bir platform yöneticisinin 2FA'sını SIFIRLAR (telefon + yedek kodlar kayıpsa ve başka yönetici yoksa kurtarma yolu).

Usage: .venv/bin/python scripts/reset_platform_2fa.py --phone 5000000000
Sunucuda çalıştırın; açık oturumlar düşer, yönetici bir sonraki girişte (2FA zorunluysa) yeniden kurar.
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.database import SessionFactory, engine  # noqa: E402
from app.models.platform_admin import PlatformAdmin, PlatformBackupCode  # noqa: E402


async def main(phone: str) -> int:
    async with SessionFactory() as db:
        admin = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.phone == phone))).scalar_one_or_none()
        if admin is None:
            print(f"HATA: {phone} numaralı yönetici yok")
            return 1
        admin.totp_secret, admin.totp_enabled, admin.totp_last_step = None, False, None
        admin.token_version += 1
        await db.execute(delete(PlatformBackupCode).where(PlatformBackupCode.admin_id == admin.id))
        await db.commit()
    await engine.dispose()
    print(f"{phone} için 2FA sıfırlandı, açık oturumlar kapatıldı.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--phone", required=True)
    sys.exit(asyncio.run(main(ap.parse_args().phone)))
