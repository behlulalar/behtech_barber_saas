"""Giriş denemesi sınırı (brute force). Kural: aynı key için LOGIN_LOCK_MINUTES içinde LOGIN_MAX_FAILURES
hatalı deneme ya da aynı IP'den aynı sürede IP_MAX_FAILURES'ten fazla hatalı deneme -> kilit.
Kilitliyken doğru şifre bile reddedilir (kilit, doğru tahmini ödüllendirmesin)."""
import math
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.net import client_ip
from app.models.login_attempt import LoginAttempt

IP_MAX_FAILURES = 30
RETENTION = timedelta(hours=24)


def make_key(phone: str, tenant_id: int | None = None) -> str:
    # Telefon kullanıcı girdisi (doğrulanmamış): uzunluğu kısıtla ki tablo şişirilemesin.
    phone = (phone or "").strip()[:30]
    return phone if tenant_id is None else f"{phone}:{tenant_id}"


def _lock_error(retry_after: int) -> HTTPException:
    minutes = max(1, math.ceil(retry_after / 60))
    return HTTPException(
        status_code=429,
        detail=f"Çok fazla hatalı giriş denemesi. Lütfen {minutes} dakika sonra tekrar deneyin",
        headers={"Retry-After": str(max(1, retry_after))},
    )


async def _unlock_in(db: AsyncSession, cond, threshold: int, window: timedelta, now: datetime) -> int | None:
    """Kilitliyse kalan saniye, değilse None. Kilit, en yeni `threshold` hatadan en eskisi pencereden çıkınca açılır."""
    stamps = (await db.execute(
        select(LoginAttempt.created_at)
        .where(cond, LoginAttempt.success == False, LoginAttempt.created_at > now - window)  # noqa: E712
        .order_by(LoginAttempt.created_at.desc())
        .limit(threshold)
    )).scalars().all()
    if len(stamps) < threshold:
        return None
    return max(1, math.ceil((stamps[-1] + window - now).total_seconds()))


async def lock_remaining(db: AsyncSession, scope: str, key: str, ip: str | None) -> int | None:
    # created_at'i de Python'dan (datetime.now) yazıyoruz: karşılaştırmada tek saat kaynağı olsun.
    now = datetime.now()
    window = timedelta(minutes=settings.login_lock_minutes)
    remaining = await _unlock_in(
        db, (LoginAttempt.scope == scope) & (LoginAttempt.key == key), settings.login_max_failures, window, now
    )
    if remaining is None and ip:
        remaining = await _unlock_in(db, LoginAttempt.ip == ip, IP_MAX_FAILURES + 1, window, now)
    return remaining


def locked_now_error() -> HTTPException:
    """Kilidi az önce tetikleyen deneme için: tam pencere kadar bekletir."""
    return _lock_error(settings.login_lock_minutes * 60)


async def ensure_not_locked(db: AsyncSession, scope: str, key: str, request: Request) -> None:
    remaining = await lock_remaining(db, scope, key, client_ip(request))
    if remaining is not None:
        raise _lock_error(remaining)


async def record_failure(db: AsyncSession, scope: str, key: str, request: Request) -> bool:
    """Hatalı denemeyi yazar ve commit eder. Bu deneme kilidi tetiklediyse True döner."""
    ip = client_ip(request)
    await db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < datetime.now() - RETENTION))
    db.add(LoginAttempt(scope=scope, key=key, ip=ip, success=False, created_at=datetime.now()))
    await db.commit()
    count = (await db.execute(
        select(func.count()).where(
            LoginAttempt.scope == scope, LoginAttempt.key == key, LoginAttempt.success == False,  # noqa: E712
            LoginAttempt.created_at > datetime.now() - timedelta(minutes=settings.login_lock_minutes),
        )
    )).scalar_one()
    return count == settings.login_max_failures


async def clear_failures(db: AsyncSession, scope: str, key: str) -> None:
    """Başarılı girişte o key'in hatalı kayıtlarını siler (commit çağıranda)."""
    await db.execute(delete(LoginAttempt).where(LoginAttempt.scope == scope, LoginAttempt.key == key))
