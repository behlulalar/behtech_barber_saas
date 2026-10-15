import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.verification_code import VerificationCode

SEND_LIMIT = 3
SEND_WINDOW_MINUTES = 10
SEND_MIN_GAP_SECONDS = 60
MAX_VERIFY_ATTEMPTS = 5


LOGIN_PURPOSE = "login"
RESET_PURPOSE = "password_reset"


async def send_code(db: Session, tenant_id: int, phone: str, purpose: str = LOGIN_PURPOSE) -> str:
    # created_at DB'nin now()'ı ile yazılıyor; saat dilimi kayması olmasın diye pencereyi de DB saatiyle hesaplıyoruz.
    recent = await db.execute(
        select(func.count())
        .select_from(VerificationCode)
        .where(
            VerificationCode.tenant_id == tenant_id,
            VerificationCode.phone == phone,
            VerificationCode.purpose == purpose,
            VerificationCode.created_at > func.now() - text(f"interval '{SEND_WINDOW_MINUTES} minutes'"),
        )
    )
    if recent.scalar_one() >= SEND_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Çok fazla kod istediniz, lütfen {SEND_WINDOW_MINUTES} dakika sonra tekrar deneyin",
        )

    last = await db.execute(
        select(func.count())
        .select_from(VerificationCode)
        .where(
            VerificationCode.tenant_id == tenant_id,
            VerificationCode.phone == phone,
            VerificationCode.purpose == purpose,
            VerificationCode.created_at > func.now() - text(f"interval '{SEND_MIN_GAP_SECONDS} seconds'"),
        )
    )
    if last.scalar_one() > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Yeni kod istemek için lütfen {SEND_MIN_GAP_SECONDS} saniye bekleyin",
        )

    fixed = settings.otp_fixed_code if settings.environment == "development" else None
    code = fixed or f"{secrets.randbelow(1000000):06d}"
    expires_at = datetime.now() + timedelta(seconds=settings.otp_expiration_seconds)

    db.add(VerificationCode(tenant_id=tenant_id, phone=phone, code=code, expires_at=expires_at, purpose=purpose))
    await db.commit()
    return code


async def verify_code(db: Session, tenant_id: int, phone: str, code: str, purpose: str = LOGIN_PURPOSE) -> bool:
    result = await db.execute(
        select(VerificationCode).where(
            VerificationCode.tenant_id == tenant_id,
            VerificationCode.phone == phone,
            VerificationCode.purpose == purpose,
            VerificationCode.is_used == False,  # noqa: E712
            VerificationCode.expires_at > datetime.now(),
        )
    )
    active = result.scalars().all()
    if not active:
        raise HTTPException(status_code=400, detail="Kod geçersiz veya süresi dolmuş")

    if any(v.code == code for v in active):
        # Başarılı doğrulamada bu telefona ait bekleyen tüm kodlar tüketilir (tek kullanımlık).
        for v in active:
            v.is_used = True
        await db.commit()
        return True

    # Yanlış kod: deneme sayacını artır; sınır aşılınca kodları geçersiz kıl (brute force koruması).
    exhausted = False
    for v in active:
        v.attempts = (v.attempts or 0) + 1
        if v.attempts >= MAX_VERIFY_ATTEMPTS:
            exhausted = True
    if exhausted:
        for v in active:
            v.is_used = True
    await db.commit()
    if exhausted:
        raise HTTPException(status_code=400, detail="Çok fazla hatalı deneme yaptınız, lütfen yeni bir kod isteyin")
    raise HTTPException(status_code=400, detail="Kod geçersiz veya süresi dolmuş")
