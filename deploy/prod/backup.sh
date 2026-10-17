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
# Görseller dosya olarak (içerik adresli, değişmez): tek bir ayna kopya yeterli; silinenler de kalır (silme yok).
mkdir -p "$DIR/media-mirror" && rsync -a /opt/berber/media/ "$DIR/media-mirror/"
python3 - "$APP" <<'PY'
import json, os, sys, datetime
p = sys.argv[1]
open("/opt/berber/backups/last_backup.json", "w").write(json.dumps({
    "at": datetime.datetime.now().isoformat(timespec="seconds"), "file": os.path.basename(p), "size_bytes": os.path.getsize(p)}))
PY
# Sunucu durumu (platform Sistem sayfası ve aksiyon kuyruğu okur): disk doluluğu ve sertifika bitişi.
python3 - <<'PY'
import json, glob, subprocess, shutil, datetime
st = shutil.disk_usage("/")
out = {"at": datetime.datetime.now().isoformat(timespec="seconds"), "disk_used_pct": round(st.used / st.total * 100),
       "disk_free_gb": round(st.free / 1024**3, 1)}
certs = [c for c in glob.glob("/etc/letsencrypt/live/*/fullchain.pem") if "berber" in c] or glob.glob("/etc/letsencrypt/live/*/fullchain.pem")
if certs:
    try:
        end = subprocess.run(["openssl", "x509", "-enddate", "-noout", "-in", certs[0]], capture_output=True, text=True, check=True).stdout.strip().split("=", 1)[1]
        dt = datetime.datetime.strptime(end, "%b %d %H:%M:%S %Y %Z")
        out["cert_not_after"] = dt.date().isoformat()
        out["cert_days_left"] = (dt - datetime.datetime.utcnow()).days
    except Exception:
        pass
open("/opt/berber/backups/host_status.json", "w").write(json.dumps(out))
PY
find "$DIR" -name 'backup_*.sql.gz' -mtime +"$KEEP" -delete
find "$DIR" -name 'evolution_*.sql.gz' -mtime +"$KEEP" -delete
echo "$(date -Is) yedek tamam: $APP ($(du -h "$APP" | cut -f1))"
