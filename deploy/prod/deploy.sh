#!/usr/bin/env bash
# YEREL makineden çalışır: frontend'i derler, kodu sunucuya gönderir, konteynerleri yeniden kurar, veritabanını günceller.
# Kullanım: deploy/prod/deploy.sh <alan_adı> [sunucu]      (örn. berberpanelim.behlulalar.online root@45.141.150.48)
# Sunucudaki diğer sistemlere (aurora, behtech-crm) dokunmaz: yalnızca /opt/berber, `berber` compose projesi ve berber nginx dosyası.
set -euo pipefail
DOMAIN="${1:?alan adı gerekli}"
HOST="${2:-root@45.141.150.48}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SSH="ssh -o BatchMode=yes $HOST"

echo "== 1/5 Frontend derleniyor ($DOMAIN)"
( cd "$REPO/frontend" && VITE_BASE_DOMAIN="$DOMAIN" VITE_PRODUCT_HOST="$DOMAIN" npm run build >/dev/null )

echo "== 2/5 Kod sunucuya gönderiliyor"
$SSH "mkdir -p /opt/berber/backend /opt/berber/deploy/prod /opt/berber/frontend/dist"
rsync -az --delete --exclude '.venv' --exclude '__pycache__' --exclude '.env' --exclude '.env.*' --exclude 'backups' --exclude 'media' \
      --exclude '.pytest_cache' --exclude 'tests' "$REPO/backend/" "$HOST:/opt/berber/backend/"
rsync -az --exclude '.env' --exclude 'backend.env' --exclude 'backups' "$REPO/deploy/prod/" "$HOST:/opt/berber/deploy/prod/"
rsync -az --no-owner --no-group --delete "$REPO/frontend/dist/" "$HOST:/opt/berber/frontend/dist/"

echo "== 3/5 Sunucu hazırlığı"
$SSH "bash /opt/berber/deploy/prod/setup-server.sh $DOMAIN"
$SSH "bash /opt/berber/deploy/prod/apply-nginx.sh $DOMAIN https wildcard"  # şablon değişiklikleri (ör. görsel konumu) her yayında uygulanır; test başarısızsa eskisi geri konur

echo "== 4/5 Konteynerler (build + up)"
$SSH "cd /opt/berber/deploy/prod && docker compose build backend && docker compose up -d --remove-orphans"
$SSH "cd /opt/berber/deploy/prod && docker compose exec -T backend python scripts/bootstrap_db.py"
$SSH "cd /opt/berber/deploy/prod && docker compose exec -T backend python scripts/migrate_images_to_files.py"

echo "== 5/5 Sağlık kontrolü"
$SSH "for i in \$(seq 1 20); do curl -fsS http://127.0.0.1:19001/api/health >/dev/null && echo 'backend sağlıklı' && break || sleep 2; done"
$SSH "cd /opt/berber/deploy/prod && docker compose ps --format 'table {{.Name}}\t{{.Status}}'"
