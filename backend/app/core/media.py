"""Yüklenen görseller (logo, kapak, personel fotoğrafı, hizmet görseli): veritabanında DEĞİL, diskte dosya olarak.

- İçerik özetine göre adlandırılır (`<32 hex>.<uzantı>`): aynı görsel tek dosya, içerik değişince adres de değişir; bu yüzden
  `Cache-Control: immutable` ile sonsuza dek önbelleğe alınabilir (tarayıcı + Cloudflare).
- Veritabanı sütunlarında artık `/api/media/<ad>` yolu tutulur. Eski kayıtlar data URL olabilir (taşıma betiği dönüştürür);
  arayüz ikisini de `<img src>` olarak kullanır.
- Yazma yalnızca kimliği doğrulanmış kaydetme uçlarında (persist) yapılır; doğrulama (şema) hiçbir şey yazmaz.
- Güvenlik: yalnızca PNG/JPEG/WebP/GIF (dosya imzası kontrol edilir; SVG ve diğerleri reddedilir), boyut sınırı, ad deseni sabit."""
import base64
import binascii
import hashlib
import re
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings

PREFIX = "/api/media/"
NAME_RE = re.compile(r"^[0-9a-f]{32}\.(png|jpg|webp|gif)$")
PATH_RE = re.compile(r"^/api/media/[0-9a-f]{32}\.(png|jpg|webp|gif)$")
DATA_RE = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,(.*)$", re.DOTALL)
MAX_BYTES = 1_600_000
MIME = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}


def media_dir() -> Path:
    p = Path(settings.media_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _ext_from_magic(raw: bytes) -> str | None:
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


def is_media_path(value: str | None) -> bool:
    return bool(value and PATH_RE.match(value))


def store_data_url(value: str) -> str:
    """data URL'i doğrulayıp dosyaya yazar; `/api/media/<ad>` yolunu döner (aynı içerik ikinci kez yazılmaz)."""
    m = DATA_RE.match(value)
    if not m:
        raise HTTPException(status_code=422, detail="Görsel geçerli bir resim dosyası olmalı (PNG, JPEG, WebP, GIF)")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="Görsel okunamadı, farklı bir dosya deneyin")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=422, detail="Görsel çok büyük, en fazla 1,5 MB olabilir")
    ext = _ext_from_magic(raw)
    if ext is None:
        raise HTTPException(status_code=422, detail="Görsel geçerli bir resim dosyası olmalı (PNG, JPEG, WebP, GIF)")
    name = f"{hashlib.sha256(raw).hexdigest()[:32]}.{ext}"
    target = media_dir() / name
    if not target.exists():
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(raw)
        tmp.replace(target)  # yarım dosya hiç görünmesin
    return PREFIX + name


def persist(value: str | None) -> str | None:
    """Kaydetmeden önce çağrılır. None/"" → None; data URL → dosyaya yazılıp yol; mevcut medya yolu → olduğu gibi (dosya yoksa 422)."""
    if value is None or value == "":
        return None
    if value.startswith("data:"):
        return store_data_url(value)
    if is_media_path(value):
        if not (media_dir() / value.removeprefix(PREFIX)).exists():
            raise HTTPException(status_code=422, detail="Görsel bulunamadı, lütfen yeniden yükleyin")
        return value
    raise HTTPException(status_code=422, detail="Görsel geçerli bir resim dosyası olmalı (PNG, JPEG, WebP, GIF)")


def file_for(name: str) -> Path | None:
    if not NAME_RE.match(name):
        return None
    p = media_dir() / name
    return p if p.is_file() else None
