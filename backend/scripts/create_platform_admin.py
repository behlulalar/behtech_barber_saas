"""Create (or reset the password of) a platform admin.

Usage: python scripts/create_platform_admin.py --name "Ad Soyad"   (telefon ve şifre sorulur; şifre gizli girilir)
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


async def upsert_platform_admin(phone: str, password: str, name: str | None = None) -> str:
    async with SessionFactory() as db:
        admin = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.phone == phone))).scalar_one_or_none()
        if admin is None:
            db.add(PlatformAdmin(phone=phone, password=hash_password(password), name=name))
            await db.commit()
            return "created"
        admin.password = hash_password(password)
        admin.token_version += 1  # eski oturumlar düşsün
        admin.is_active = True
        if name:
            admin.name = name
        await db.commit()
        return "password updated"


async def main(phone: str, password: str, name: str | None) -> None:
    status = await upsert_platform_admin(phone, password, name)
    await engine.dispose()
    print(f"Platform admin {phone}: {status}")


def _ask_interactive(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    """Telefon/şifre verilmemişse sorar (şifre GİZLİ girilir, komut satırında/işlem listesinde görünmez)."""
    import getpass

    if not args.phone:
        args.phone = input("Telefon (5XXXXXXXXX): ").strip()
    if not args.password:
        first = getpass.getpass("Şifre (en az 8 karakter): ")
        if first != getpass.getpass("Şifre (tekrar): "):
            parser.error("şifreler aynı değil")
        args.password = first


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phone", help="10 hane, 5 ile başlar (verilmezse sorulur)")
    parser.add_argument("--password", help="verilmezse GİZLİ sorulur (önerilen: argüman olarak vermeyin)")
    parser.add_argument("--name", help="görünen ad (isteğe bağlı)")
    args = parser.parse_args()
    _ask_interactive(args, parser)
    if not re.fullmatch(r"5\d{9}", args.phone):
        parser.error("telefon ^5\\d{9}$ biçiminde olmalı")
    from app.core.password_policy import password_policy_error

    problem = password_policy_error(args.password, args.phone)  # platform yöneticileri için aynı kural: >= 8, yaygın değil, telefona eşit değil
    if problem:
        parser.error(problem)
    asyncio.run(main(args.phone, args.password, args.name))
