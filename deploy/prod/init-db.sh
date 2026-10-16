#!/bin/sh
# İlk kurulumda çalışır (yalnızca boş veri dizininde): Evolution için AYRI veritabanı ve kullanıcı.
# Uygulama kullanıcısı (berber) Evolution verisine, Evolution kullanıcısı uygulama verisine erişemez.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE evolution LOGIN PASSWORD '${EVOLUTION_DB_PASSWORD}';
CREATE DATABASE evolution OWNER evolution;
REVOKE ALL ON DATABASE behtech_saas FROM PUBLIC;
SQL
