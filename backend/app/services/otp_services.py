import secrets
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.core.config import settings
from app.models.verification_code import VerificationCode


async def send_code(db: Session, tenant_id: int, phone: str) -> str:
    code = f"{secrets.randbelow(1000000):06d}"
    expires_at = datetime.now() + timedelta(seconds=settings.otp_expiration_seconds)

    verification_code = VerificationCode(
        tenant_id=tenant_id,
        phone=phone,
        code=code,
        expires_at=expires_at,
    )
    db.add(verification_code)
    await db.commit()
    await db.refresh(verification_code)

    return code


async def verify_code(db: Session, tenant_id: int, phone: str, code: str) -> bool:
    query = select(VerificationCode).where(
        VerificationCode.tenant_id == tenant_id,
        VerificationCode.phone == phone,
        VerificationCode.code == code,
        VerificationCode.is_used == False,
        VerificationCode.expires_at > datetime.now(),
    )
    result = await db.execute(query)
    verification = result.scalar_one_or_none()

    if verification is None:
        raise HTTPException(status_code=400, detail="Kod geçersiz veya süresi dolmuş")

    verification.is_used = True
    await db.commit()

    return True
