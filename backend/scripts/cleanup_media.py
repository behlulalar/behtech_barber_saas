"""Veritabanında artık hiçbir kayıtta kullanılmayan görsel dosyalarını siler (görsel değiştirilince eskisi dosyada kalır).
Güvenlik payı: 1 günden yeni dosyalara dokunulmaz (yükleme ile kaydetme arasındaki aralık). Varsayılan: yalnızca listeler.

Kullanım: python scripts/cleanup_media.py [--delete]
"""
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import psycopg2  # noqa: E402

from app.core import media  # noqa: E402
from app.core.config import settings  # noqa: E402

COLUMNS = [("tenant_settings", "logo_image"), ("tenant_settings", "banner_image"), ("staff", "photo_image"), ("services", "image")]
MIN_AGE = 24 * 3600


def main() -> int:
    delete = "--delete" in sys.argv
    conn = psycopg2.connect(settings.database_url.replace("postgresql+asyncpg://", "postgresql://"))
    used: set[str] = set()
    with conn, conn.cursor() as cur:
        for table, col in COLUMNS:
            cur.execute(f"select {col} from {table} where {col} like '/api/media/%'")
            used.update(v.removeprefix(media.PREFIX) for (v,) in cur.fetchall())
    conn.close()
    orphans = [p for p in media.media_dir().iterdir() if media.NAME_RE.match(p.name) and p.name not in used and time.time() - p.stat().st_mtime > MIN_AGE]
    for p in orphans:
        print(("SİLİNDİ " if delete else "yetim ") + p.name)
        if delete:
            p.unlink()
    print(f"{len(orphans)} yetim dosya{' silindi' if delete else ' (silmek için --delete)'}; kullanılan: {len(used)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
