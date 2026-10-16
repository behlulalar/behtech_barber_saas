# Canlı Dağıtım (Production) Rehberi

Sunucu: `root@45.141.150.48` (Ubuntu 22.04, 4 vCPU, ~6 GB RAM). **Bu sunucuda başka iki sistem çalışır: `behtech-crm` (host üzerinde) ve `aurora` (Docker).
Onlara DOKUNMAYIN.** Berber sistemi tamamen ayrıdır:

| Parça | Berber (bizim) | Diğerleri (dokunma) |
| --- | --- | --- |
| Dizin | `/opt/berber` | `/opt/aurora`, `/opt/behtech-sales-hub`, `/opt/evolution-api` |
| Docker projesi/ağ | `berber` / `berber_default` | `aurora_*`, `behtech_crm_net`, `evolution-api_*` |
| Veritabanı | kendi `berber_db` (PostgreSQL 16, İstanbul saati) | host PG14, `aurora-db` |
| Evolution (WhatsApp) | kendi `berber_evolution` v2.3.7, ayrı DB/kullanıcı | `aurora-evolution`, `/opt/evolution-api` |
| Port | yalnızca `127.0.0.1:19001` (backend) | 18080, 18310, 6379, 5432 |
| nginx | `/etc/nginx/sites-enabled/<alan>.conf`, `conf.d/berber-limits.conf`, `snippets/berber-security.conf` | `beauty.*`, `behtech-saleshub.conf`, `nginx-rate-limit.conf` |
| Zamanlayıcı | `/etc/cron.d/berber` | root crontab |
| Sertifika | `/etc/letsencrypt/live/<alan>/` | beauty, saleshub |

Konteyner bellek sınırları: db 512 MB, backend 700 MB, evolution 900 MB (komşuları korur).

## Alan adı
`BASE_DOMAIN` = `berberpanelim.behlulalar.online`. Tanıtım sitesi ve platform paneli bu adreste; dükkânlar `<slug>.berberpanelim.behlulalar.online`.
Alan adı derleme zamanında frontend'e (`VITE_BASE_DOMAIN`, `VITE_PRODUCT_HOST`) ve çalışma zamanında backend'e (`BASE_DOMAIN`) verilir; değişince `deploy.sh`'yi yeni alan adıyla çalıştırıp nginx/sertifikayı yenilemek yeter.
Alan adı Cloudflare arkasındadır (SSL modu: Full). Gerçek istemci IP'si `CF-Connecting-IP`'den, yalnızca Cloudflare adreslerinden gelen isteklerde okunur.

## Güncelleme (kod değişince)
```
# Yerelde (Mac), testler geçtikten sonra:
deploy/prod/deploy.sh berberpanelim.behlulalar.online
```
Frontend'i derler, kodu `/opt/berber`'e rsync'ler, imajı yeniden kurar, konteynerleri günceller, `scripts/bootstrap_db.py` (boşsa schema.sql + `alembic upgrade head`) çalıştırır, sağlığı kontrol eder.
Sırlar (`/opt/berber/deploy/prod/.env`, `backend.env`) rsync'ten HARİÇTİR; ilk kurulumda sunucuda üretilir (600, root).

## nginx
`deploy/prod/apply-nginx.sh <alan> https [wildcard]` — yapılandırmayı üretir, `nginx -t` ile sınar, **başarısızsa eskiyi geri koyar** (diğer sitelerin yeniden yüklemesi bozulmasın). nginx 1.18: `http2` yönergesi `listen ... ssl http2` biçiminde.

## Sertifika
- Ana alan adı: Let's Encrypt HTTP-01 (webroot `/var/www/berber-acme`), certbot otomatik yeniler.
- **Dükkân alt alan adları için JOKER sertifika gerekir** (DNS-01, Cloudflare API belirteci). Bkz. aşağı.

## Yedek ve geri yükleme
- Her gün 03:30: `backup.sh` -> `/opt/berber/backups/backup_*.sql.gz` (uygulama) + `evolution_*.sql.gz` (WhatsApp oturumları), 14 gün saklanır.
- Geri yükleme: `gunzip -c backups/backup_X.sql.gz | docker exec -i berber_db psql -U berber -d behtech_saas` (önce uygulamayı durdurun, boş veritabanı kullanın).
- **Henüz yok:** sunucu dışı kopya (rclone/S3), geri yükleme tatbikatı.

## Günlük görev
09:00 `run_billing_checks.py` (abonelik hatırlatma/askı). Loglar: `/var/log/berber/`.

## Komutlar
```
cd /opt/berber/deploy/prod
docker compose ps                         # durum
docker compose logs -f --tail 100 backend # günlük
docker compose restart backend
docker compose exec backend python scripts/create_platform_admin.py --name "Ad Soyad"   # ilk platform yöneticisi (telefon/şifre sorar)
docker compose exec backend python scripts/reset_platform_2fa.py --phone <tel>          # 2FA kurtarma
docker compose exec backend python scripts/run_billing_checks.py
```

## Bilinen sınırlar / yapılacaklar
- Joker DNS + joker sertifika (dükkân alt alan adları) — kullanıcı eylemi gerekir (Cloudflare).
- SMTP (e-posta bildirimi) ayarlanmadı; `backend.env`'e `SMTP_*` eklenip `docker compose up -d backend`.
- Sunucu dışı yedek, izleme/uyarı (uptime, disk), `scripts/verify_backup.py` (ayrı bakım kullanıcısı gerekir) kurulmadı.
- Cloudflare "Web Analytics" betiği CSP'ye takılır (zararsız); istenirse Cloudflare'de kapatın ya da CSP'ye izin verin.
