#!/usr/bin/env bash
# Uygulama + Evolution (WhatsApp oturumları) veritabanlarını yedekler; panelin Sistem sayfası için last_backup.json yazar.
# Eski yedekleri BACKUP_RETENTION_DAYS (varsayılan 14) gün sonra siler.
set -euo pipefail
DIR=/opt/berber/backups
KEEP=${BACKUP_RETENTION_DAYS:-14}
TS=$(date +%Y-%m-%d_%H-%M-%S)
mkdir -p "$DIR"
APP="$DIR/backup_$TS.sql.gz"
docker exec berber_db pg_dump -U berber --no-owner behtech_saas | gzip > "$APP.tmp" && mv "$APP.tmp" "$APP"
docker exec berber_db pg_dump -U berber --no-owner evolution | gzip > "$DIR/evolution_$TS.sql.gz"
chmod 600 "$DIR"/*.gz
python3 - "$APP" <<'PY'
import json, os, sys, datetime
p = sys.argv[1]
open("/opt/berber/backups/last_backup.json", "w").write(json.dumps({
    "at": datetime.datetime.now().isoformat(timespec="seconds"), "file": os.path.basename(p), "size_bytes": os.path.getsize(p)}))
PY
find "$DIR" -name 'backup_*.sql.gz' -mtime +"$KEEP" -delete
find "$DIR" -name 'evolution_*.sql.gz' -mtime +"$KEEP" -delete
echo "$(date -Is) yedek tamam: $APP ($(du -h "$APP" | cut -f1))"
