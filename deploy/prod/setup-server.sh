#!/usr/bin/env bash
# Sunucuda (root) çalışır, İDEMPOTENT: dizinler, kullanıcı, gizli anahtarlar (yalnızca yoksa üretir), günlük/zamanlayıcı dosyaları.
# Kullanım: /opt/berber/deploy/prod/setup-server.sh <alan_adı>
set -euo pipefail
DOMAIN="$1"
ROOT=/opt/berber
PROD=$ROOT/deploy/prod

id berber >/dev/null 2>&1 || useradd --system --home "$ROOT" --shell /usr/sbin/nologin berber
mkdir -p "$ROOT/backups" "$ROOT/media" "$ROOT/frontend/dist" /var/www/berber-acme /var/log/berber
chown 10001:10001 "$ROOT/media"  # backend konteyneri (uid 10001) görselleri buraya yazar; nginx okur (755)
chmod 755 "$ROOT/media"
chmod 711 "$ROOT"  # nginx (www-data) frontend/dist'e ulaşabilsin; sır dosyaları 600, listeleme kapalı
chmod -R a+rX "$ROOT/frontend"

gen() { python3 -c "import secrets; print(secrets.token_urlsafe($1))"; }

if [ ! -f "$PROD/.env" ]; then
  echo ">> Gizli anahtarlar üretiliyor (yalnızca ilk kurulumda)"
  DB_PASSWORD=$(gen 24); EVO_DB_PASSWORD=$(gen 24); EVO_KEY=$(gen 32)
  JWT_SECRET=$(gen 64); WEBHOOK_SECRET=$(gen 32); TOTP_KEY=$(gen 48)
  umask 077
  cat > "$PROD/.env" <<ENV
# Docker Compose değişkenleri (sır içerir: 600). Git'e GİRMEZ.
DB_PASSWORD=$DB_PASSWORD
EVOLUTION_DB_PASSWORD=$EVO_DB_PASSWORD
EVOLUTION_API_KEY=$EVO_KEY
ENV
  cat > "$PROD/backend.env" <<ENV
# Backend ayarları (sır içerir: 600). Ayar sınıfı BİLİNMEYEN anahtarı reddeder; yalnızca backend'in okuduğu anahtarlar buraya yazılır.
DATABASE_URL=postgresql+asyncpg://berber:$DB_PASSWORD@db:5432/behtech_saas
JWT_SECRET=$JWT_SECRET
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120
BASE_DOMAIN=$DOMAIN
ENVIRONMENT=production
DAILY_APPOINTMENT_LIMIT=0
OTP_EXPIRATION_SECONDS=120
BACKUP_RETENTION_DAYS=14
TRUST_PROXY_HEADERS=true
TOTP_ENCRYPTION_KEY=$TOTP_KEY
EVOLUTION_API_BASE_URL=http://evolution:8080
EVOLUTION_API_KEY=$EVO_KEY
EVOLUTION_WEBHOOK_URL=http://backend:8001/api/webhooks/evolution
EVOLUTION_WEBHOOK_SECRET=$WEBHOOK_SECRET
VAPID_SUBJECT=mailto:admin@$DOMAIN
ENV
  chown root:root "$PROD/.env" "$PROD/backend.env"
  echo ">> .env ve backend.env oluşturuldu"
else
  echo ">> .env zaten var, dokunulmadı"
fi

# Zamanlanmış görevler (yalnızca berber; sunucudaki diğer crontab'lara dokunmaz)
cat > /etc/cron.d/berber <<CRON
# BehTech Randevu — saatler Europe/Istanbul
CRON_TZ=Europe/Istanbul
SHELL=/bin/bash
# Günlük abonelik kontrolü 09:00 (hatırlatma, deneme bitişi, askıya alma/açma)
0 9 * * * root docker exec berber_backend python scripts/run_billing_checks.py >> /var/log/berber/billing.log 2>&1
# Veritabanı yedeği 03:30
30 3 * * * root $PROD/backup.sh >> /var/log/berber/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/berber

cat > /etc/logrotate.d/berber <<'LR'
/var/log/berber/*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
LR
echo ">> setup-server tamam"
