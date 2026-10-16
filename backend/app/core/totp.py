"""TOTP (RFC 6238): 6 hane, 30 sn, HMAC-SHA1 — Google Authenticator / Microsoft Authenticator / 1Password / Apple Parolalar uyumlu.
Gizli anahtar veritabanında Fernet ile ŞİFRELİ saklanır (anahtar: TOTP_ENCRYPTION_KEY, yoksa JWT_SECRET'tan türetilir).
Yedek kodlar HMAC-SHA256 ile karıştırılır (50 bit rastgelelik; yalnızca tek kullanımlık)."""
import base64
import hashlib
import hmac
import io
import secrets
import struct
import time
from urllib.parse import quote

import segno
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

STEP = 30
DIGITS = 6
WINDOW = 1  # saat sapmasına tolerans: önceki/sonraki 30 sn'lik adım
BACKUP_CODE_COUNT = 10
_B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # 0/o/1/l/i yok


def new_secret() -> str:
    """160 bit, base32 (kimlik doğrulayıcı uygulamaların beklediği biçim)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** DIGITS)
    return f"{value:0{DIGITS}d}"


def code_at(secret: str, at: float | None = None) -> str:
    return _hotp(secret, int((at if at is not None else time.time()) // STEP))


def verify(secret: str, code: str, last_step: int | None = None, at: float | None = None) -> int | None:
    """Kod geçerliyse kullanılan adım numarasını döner (aynı/eski adım tekrar kabul edilmez: tekrar oynatma koruması), değilse None."""
    code = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(code) != DIGITS:
        return None
    now_step = int((at if at is not None else time.time()) // STEP)
    for step in range(now_step - WINDOW, now_step + WINDOW + 1):
        if last_step is not None and step <= last_step:
            continue
        if hmac.compare_digest(_hotp(secret, step), code):
            return step
    return None


def otpauth_uri(secret: str, account: str, issuer: str = "BehTech Randevu") -> str:
    label = quote(f"{issuer}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits={DIGITS}&period={STEP}"


def qr_data_uri(uri: str) -> str:
    # <img src> için BAĞIMSIZ bir SVG gerekir: xmlns bildirimi şart (svg_inline gömme içindir, xmlns'i atlar ve görsel kırık görünür).
    buf = io.BytesIO()
    segno.make(uri, error="m").save(buf, kind="svg", scale=6, border=2, dark="#000000", light="#ffffff", xmldecl=False, svgns=True)
    return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


# ---- gizli anahtarı veritabanında şifreleme
def _fernet() -> Fernet:
    raw = settings.totp_encryption_key or settings.jwt_secret
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(("totp:" + raw).encode()).digest()))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None  # anahtar değişmiş: 2FA kurtarma (sıfırlama) gerekir


# ---- yedek kodlar
def new_backup_codes() -> list[str]:
    return ["".join(secrets.choice(_CODE_ALPHABET) for _ in range(10)) for _ in range(BACKUP_CODE_COUNT)]


def normalize_backup_code(code: str) -> str:
    return "".join(ch for ch in (code or "").lower() if ch.isalnum())


def hash_backup_code(code: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), ("backup:" + normalize_backup_code(code)).encode(), hashlib.sha256).hexdigest()
