import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.verification_code import VerificationCode

SEND_LIMIT = 3
SEND_WINDOW_MINUTES = 10


async def send_code(db: Session, tenant_id: int, phone: str) -> str:
    # created_at DB'nin now()'ı ile yazılıyor; saat dilimi kayması olmasın diye pencereyi de DB saatiyle hesaplıyoruz.
    recent = await db.execute(
        select(func.count())
        .select_from(VerificationCode)
        .where(
            VerificationCode.tenant_id == tenant_id,
            VerificationCode.phone == phone,
            VerificationCode.created_at > func.now() - text(f"interval '{SEND_WINDOW_MINUTES} minutes'"),
        )
    )
    if recent.scalar_one() >= SEND_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Çok fazla kod istediniz, lütfen {SEND_WINDOW_MINUTES} dakika sonra tekrar deneyin",
        )

    code = f"{secrets.randbelow(1000000):06d}"
    expires_at = datetime.now() + timedelta(seconds=settings.otp_expiration_seconds)

    db.add(VerificationCode(tenant_id=tenant_id, phone=phone, code=code, expires_at=expires_at))
    await db.commit()
    return code


async def verify_code(db: Session, tenant_id: int, phone: str, code: str) -> bool:
    query = select(VerificationCode).where(
        VerificationCode.tenant_id == tenant_id,
        VerificationCode.phone == phone,
        VerificationCode.code == code,
        VerificationCode.is_used == False,  # noqa: E712
        VerificationCode.expires_at > datetime.now(),
    )
    result = await db.execute(query)
    verification = result.scalars().first()

    if verification is None:
        raise HTTPException(status_code=400, detail="Kod geçersiz veya süresi dolmuş")

    verification.is_used = True
    await db.commit()
    return True
