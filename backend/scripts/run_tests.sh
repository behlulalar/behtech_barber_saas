#!/usr/bin/env bash
# Backend test paketini çalıştırır: ayrı test DB'si oluşturur, migration'ları uygular, pytest -q koşar.
# Kullanım: bash scripts/run_tests.sh [pytest argümanları]
# ASLA geliştirme veritabanına (behtech_saas) dokunmaz.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_USER="${TEST_DB_USER:-muhammedbehlulalar}"
DB_HOST="${TEST_DB_HOST:-localhost}"
DB_NAME="behtech_saas_test"
export DATABASE_URL="${TEST_DATABASE_URL:-postgresql+asyncpg://${DB_USER}@${DB_HOST}:5432/${DB_NAME}}"
case "$DATABASE_URL" in
  *_test) ;;
  *) echo "HATA: DATABASE_URL '_test' ile bitmeli, test DB'si dışında çalışmam." >&2; exit 2 ;;
esac
export ENVIRONMENT=development
export OTP_FIXED_CODE=

if ! psql -U "$DB_USER" -h "$DB_HOST" -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  createdb -U "$DB_USER" -h "$DB_HOST" "$DB_NAME"
fi

PY=".venv/bin/python"
# Boş DB ise önce schema.sql (alembic zinciri boş DB'den başlayamaz), sonra alembic upgrade head.
"$PY" -m tests.bootstrap_db
exec "$PY" -m pytest -q "$@"
