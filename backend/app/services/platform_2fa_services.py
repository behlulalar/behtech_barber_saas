"""Platform yöneticileri için iki aşamalı doğrulama (TOTP + yedek kodlar)."""
from datetime import datetime

import jwt
from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import totp
from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, verify_password
from app.models.platform_admin import PlatformAdmin, PlatformBackupCode
from app.services import login_throttle
from app.services.audit_services import audit

MFA_TOKEN_MINUTES = 5
BAD_CODE = "Doğrulama kodu hatalı"
SETUP_REQUIRED = "İki aşamalı doğrulama kurulumu gerekli"


def required() -> bool:
    """Zorunlu mu? Ayar yoksa production'da zorunlu, geliştirmede isteğe bağlı."""
    if settings.platform_2fa_required is not None:
        return settings.platform_2fa_required
    return settings.environment == "production"


def make_mfa_token(admin: PlatformAdmin, remember: bool) -> str:
    return create_access_token({"sub": str(admin.id), "type": "platform_mfa", "tv": admin.token_version, "rem": remember},
                               expires_minutes=MFA_TOKEN_MINUTES)


def make_access_token(admin: PlatformAdmin, remember: bool, setup_only: bool = False) -> str:
    claims = {"sub": str(admin.id), "type": "platform_admin", "tv": admin.token_version}
    if setup_only:
        claims["mfa_setup"] = True
    return create_access_token(
        claims, expires_minutes=15 if setup_only else (settings.remember_token_expire_minutes if remember else None)
    )


async def _check_password(admin: PlatformAdmin, password: str) -> None:
    if not verify_password(password, admin.password):
        raise HTTPException(status_code=400, detail="Şifre hatalı")


async def _backup_remaining(db: AsyncSession, admin_id: int) -> int:
    return (await db.execute(select(func.count()).select_from(PlatformBackupCode).where(
        PlatformBackupCode.admin_id == admin_id, PlatformBackupCode.used_at.is_(None)))).scalar_one()


async def status(db: AsyncSession, admin: PlatformAdmin) -> dict:
    return {"enabled": admin.totp_enabled, "required": required(),
            "backup_codes_remaining": await _backup_remaining(db, admin.id) if admin.totp_enabled else 0}


async def begin_setup(db: AsyncSession, admin: PlatformAdmin, password: str) -> dict:
    """Yeni gizli anahtar üretir (henüz AÇIK değil; kod doğrulanınca açılır). Şifre yeniden istenir."""
    if admin.totp_enabled:
        raise HTTPException(status_code=409, detail="İki aşamalı doğrulama zaten açık")
    await _check_password(admin, password)
    secret = totp.new_secret()
    admin.totp_secret = totp.encrypt_secret(secret)
    admin.totp_last_step = None
    await db.commit()
    uri = totp.otpauth_uri(secret, admin.phone)
    return {"secret": secret, "otpauth_uri": uri, "qr": totp.qr_data_uri(uri)}


async def _issue_backup_codes(db: AsyncSession, admin: PlatformAdmin) -> list[str]:
    await db.execute(delete(PlatformBackupCode).where(PlatformBackupCode.admin_id == admin.id))
    codes = totp.new_backup_codes()
    db.add_all([PlatformBackupCode(admin_id=admin.id, code_hash=totp.hash_backup_code(c)) for c in codes])
    return codes


async def _verify_code(db: AsyncSession, admin: PlatformAdmin, code: str) -> str | None:
    """TOTP ya da yedek kod. Geçerliyse 'totp' | 'backup', değilse None. Başarıda durum güncellenir (commit çağıranda)."""
    secret = totp.decrypt_secret(admin.totp_secret) if admin.totp_secret else None
    if secret:
        step = totp.verify(secret, code, admin.totp_last_step)
        if step is not None:
            admin.totp_last_step = step
            return "totp"
    if admin.totp_enabled:
        h = totp.hash_backup_code(code)
        row = (await db.execute(select(PlatformBackupCode).where(
            PlatformBackupCode.admin_id == admin.id, PlatformBackupCode.code_hash == h,
            PlatformBackupCode.used_at.is_(None)))).scalar_one_or_none()
        if row is not None:
            row.used_at = datetime.now()
            return "backup"
    return None


async def confirm_setup(db: AsyncSession, admin: PlatformAdmin, code: str, request: Request) -> list[str]:
    if admin.totp_enabled:
        raise HTTPException(status_code=409, detail="İki aşamalı doğrulama zaten açık")
    secret = totp.decrypt_secret(admin.totp_secret) if admin.totp_secret else None
    if not secret:
        raise HTTPException(status_code=400, detail="Önce kurulumu başlatın")
    step = totp.verify(secret, code)
    if step is None:
        raise HTTPException(status_code=400, detail=BAD_CODE)
    admin.totp_enabled = True
    admin.totp_last_step = step
    codes = await _issue_backup_codes(db, admin)
    await audit(db, actor=admin, request=request, action="platform.2fa_enabled", entity_type="platform_admin",
                entity_id=admin.id, summary="İki aşamalı doğrulama açıldı")
    await db.commit()
    return codes


async def _require_current(db: AsyncSession, admin: PlatformAdmin, password: str, code: str, request: Request) -> str:
    """Hassas işlem (kapatma, yedek kod yenileme): şifre + geçerli kod. Yanlış denemeler kilide sayılır."""
    key = login_throttle.make_key(admin.phone)
    await login_throttle.ensure_not_locked(db, "platform_mfa", key, request)
    await _check_password(admin, password)
    method = await _verify_code(db, admin, code)
    if method is None:
        if await login_throttle.record_failure(db, "platform_mfa", key, request):
            raise login_throttle.locked_now_error()
        raise HTTPException(status_code=400, detail=BAD_CODE)
    await login_throttle.clear_failures(db, "platform_mfa", key)
    return method


async def disable(db: AsyncSession, admin: PlatformAdmin, password: str, code: str, request: Request) -> None:
    if not admin.totp_enabled:
        raise HTTPException(status_code=409, detail="İki aşamalı doğrulama zaten kapalı")
    if required():
        raise HTTPException(status_code=400, detail="İki aşamalı doğrulama zorunlu, kapatılamaz")
    await _require_current(db, admin, password, code, request)
    await _clear(db, admin)
    admin.token_version += 1  # diğer oturumlar düşsün
    await audit(db, actor=admin, request=request, action="platform.2fa_disabled", entity_type="platform_admin",
                entity_id=admin.id, summary="İki aşamalı doğrulama kapatıldı")
    await db.commit()


async def regenerate_backup_codes(db: AsyncSession, admin: PlatformAdmin, password: str, code: str, request: Request) -> list[str]:
    if not admin.totp_enabled:
        raise HTTPException(status_code=409, detail="Önce iki aşamalı doğrulamayı açın")
    await _require_current(db, admin, password, code, request)
    codes = await _issue_backup_codes(db, admin)
    await audit(db, actor=admin, request=request, action="platform.2fa_backup_regenerated", entity_type="platform_admin",
                entity_id=admin.id, summary="2FA yedek kodları yenilendi")
    await db.commit()
    return codes


async def _clear(db: AsyncSession, admin: PlatformAdmin) -> None:
    admin.totp_secret = None
    admin.totp_enabled = False
    admin.totp_last_step = None
    await db.execute(delete(PlatformBackupCode).where(PlatformBackupCode.admin_id == admin.id))


async def reset_for(db: AsyncSession, actor: PlatformAdmin, target: PlatformAdmin, request: Request) -> None:
    """Telefonunu/yedek kodlarını kaybeden yöneticinin 2FA'sını BAŞKA bir yönetici sıfırlar (kendi 2FA'nı sıfırlayamazsın)."""
    if actor.id == target.id:
        raise HTTPException(status_code=400, detail="Kendi 2FA'nızı sıfırlayamazsınız; kapatma için şifre ve kod gerekir")
    await _clear(db, target)
    target.token_version += 1  # açık oturumları düşür
    await audit(db, actor=actor, request=request, action="admin.2fa_reset", entity_type="platform_admin",
                entity_id=target.id, summary=f"{target.phone} yöneticisinin 2FA'sı sıfırlandı")
    await db.commit()


# ---- giriş ikinci adımı
async def login_second_step(db: AsyncSession, mfa_token: str, code: str, request: Request) -> tuple[PlatformAdmin, str, bool]:
    """Şifre adımından sonra kodu doğrular. (yönetici, yöntem, remember) döner. Yanlış kod kilide sayılır."""
    try:
        payload = decode_access_token(mfa_token)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Oturum süresi doldu, lütfen yeniden giriş yapın")
    if payload.get("type") != "platform_mfa":
        raise HTTPException(status_code=401, detail="Oturum süresi doldu, lütfen yeniden giriş yapın")
    admin = (await db.execute(select(PlatformAdmin).where(PlatformAdmin.id == int(payload["sub"])))).scalar_one_or_none()
    if admin is None or not admin.is_active or payload.get("tv", 0) != admin.token_version or not admin.totp_enabled:
        raise HTTPException(status_code=401, detail="Oturum süresi doldu, lütfen yeniden giriş yapın")
    key = login_throttle.make_key(admin.phone)
    await login_throttle.ensure_not_locked(db, "platform_mfa", key, request)
    method = await _verify_code(db, admin, code)
    if method is None:
        if await login_throttle.record_failure(db, "platform_mfa", key, request):
            await audit(db, actor=None, request=request, action="platform.login_locked", actor_label=key,
                        summary=f"{key} için 2FA kodu çok fazla hatalı denendi, kilitlendi")
            await db.commit()
            raise login_throttle.locked_now_error()
        raise HTTPException(status_code=401, detail=BAD_CODE)
    await login_throttle.clear_failures(db, "platform_mfa", key)
    return admin, method, bool(payload.get("rem"))
