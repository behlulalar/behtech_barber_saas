"""Veritabanında data URL olarak duran görselleri (logo, kapak, personel fotoğrafı, hizmet görseli) dosyaya taşır;
sütuna `/api/media/<ad>` yolunu yazar. İdempotent: yalnızca `data:` ile başlayan kayıtlara dokunur. Deploy sırasında çalışır.

Kullanım (konteyner içinde): python scripts/migrate_images_to_files.py
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import psycopg2  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.core import media  # noqa: E402
from app.core.config import settings  # noqa: E402

# (tablo, birincil anahtar, sütun)
TARGETS = [("tenant_settings", "tenant_id", "logo_image"), ("tenant_settings", "tenant_id", "banner_image"),
           ("staff", "id", "photo_image"), ("services", "id", "image")]


def main() -> int:
    conn = psycopg2.connect(settings.database_url.replace("postgresql+asyncpg://", "postgresql://"))
    moved = failed = 0
    try:
        with conn, conn.cursor() as cur:
            for table, pk, col in TARGETS:
                cur.execute(f"select {pk}, {col} from {table} where {col} like 'data:%'")
                for key, value in cur.fetchall():
                    try:
                        path = media.store_data_url(value)
                    except HTTPException as exc:
                        failed += 1
                        print(f"ATLANDI {table}.{col} {pk}={key}: {exc.detail}")
                        continue
                    cur.execute(f"update {table} set {col} = %s where {pk} = %s", (path, key))
                    moved += 1
    finally:
        conn.close()
    print(f"Görsel taşıma: {moved} taşındı, {failed} atlandı")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
