# İşletim (Operasyon) Rehberi

Bu belge sunucuyu işleten kişi içindir: zamanlanmış görevler, ortam değişkenleri, yedekten geri yükleme
ve "günlük kontrol çalışmıyor" sorun giderme. Platform panelindeki **Sistem** sayfası, aşağıdaki işlerin
durumunu canlı gösterir.

## 1. Zamanlanmış görevler (cron)

Hazır örnek: [`deploy/crontab.example`](../deploy/crontab.example). Özet:

| İş | Zaman | Komut (backend dizininde) |
| --- | --- | --- |
| Günlük abonelik kontrolü | her gün 09:00 | `.venv/bin/python scripts/run_billing_checks.py` |
| Veritabanı yedeği | her gün 03:00 | `.venv/bin/python scripts/backup_database.py` |
| Yedek doğrulama | haftada bir (Pazar 04:00) | `.venv/bin/python scripts/verify_backup.py` |

- Günlük kontrol her çalışmada `job_runs` tablosuna yazılır (`trigger='cron'`). Hata olursa `ok=false`, `error` dolu
  ve çıkış kodu 1 olur. Panelde "Kontrolleri şimdi çalıştır" düğmesi aynı işi `trigger='manual'` ile çalıştırır.
- Yedek başarıyla bitince `backend/backups/last_backup.json` yazılır; eski yedekler `BACKUP_RETENTION_DAYS`
  günden sonra silinir.
- `verify_backup.py` en yeni yedeği geçici bir veritabanına (`behtech_verify_<zaman>`) geri yükler, ana tabloların
  satır sayısını canlı veritabanıyla karşılaştırır (yedekteki sayı canlıdan **fazla olamaz**, eksik olabilir),
  geçici veritabanını her durumda siler ve `backend/backups/last_verify.json` yazar. Hata olursa çıkış kodu 1.
- Doğrulama geçici veritabanı oluşturur; bunun için **uygulamanın kullanıcısına değil**, ayrı bir bakım kullanıcısına `CREATEDB` verin
  (`CREATE ROLE behtech_maint LOGIN CREATEDB PASSWORD '...'`) ve cron ortamına `BACKUP_VERIFY_DB_USER` / `BACKUP_VERIFY_DB_PASSWORD` yazın.
  Uygulama kullanıcısının yetkisi artırılmamalıdır: bir güvenlik açığı olursa saldırganın veritabanı oluşturup silmesini kolaylaştırır.
- Panel, günlük kontrol ya da yedek 26 saatten eskiyse uyarı gösterir.

## 2. Ortam değişkenleri (`backend/.env`)

| Değişken | Varsayılan | Anlamı |
| --- | --- | --- |
| `LOGIN_MAX_FAILURES` | 5 | Aynı hesap için pencere içinde izin verilen hatalı giriş sayısı |
| `LOGIN_LOCK_MINUTES` | 15 | Hatalı deneme penceresi ve kilit süresi (dakika) |
| `TRUST_PROXY_HEADERS` | false | `true` ise istemci IP'si `X-Forwarded-For`'un ilk değerinden alınır |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS` | yok | Ödeme takibi e-postaları; yoksa e-posta kanalı kapalı |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | yok | Web push bildirimleri; yoksa push kapalı |
| `BACKUP_RETENTION_DAYS` | - | Yedeklerin saklanma süresi (gün) |
| `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY` | - | Evolution sunucusu (platform altyapısı) adresi ve anahtarı |
| `EVOLUTION_WEBHOOK_URL`, `EVOLUTION_WEBHOOK_SECRET` | yok | Dükkân WhatsApp bağlantı olaylarının geleceği adres ve `?token=` anahtarı; yoksa durum yalnızca panel açıldığında yenilenir |
| `WHATSAPP_TENANT_HOURLY_LIMIT` / `WHATSAPP_TENANT_DAILY_LIMIT` | 300 / 2000 | Dükkân başına doğrulama kodu tavanı (son çare). Onay/hatırlatma gibi sistem mesajları SINIRSIZ, kuyrukta aralıklı gider |
| `OTP_IP_HOURLY_LIMIT` / `OTP_IP_DAILY_LIMIT` | 10 / 30 | Aynı IP'den doğrulama kodu isteği |
| `OTP_UNVERIFIED_BREAKER` | 25 | Son 1 saatte girilmeyen kod eşiği; aşılınca kod gönderimi durur, platforma bildirim gider |
| `WHATSAPP_FAILURE_PAUSE` | 5 | Arka arkaya başarısız gönderimde dükkânın gönderimi otomatik durur (yeniden bağlanınca kalkar) |
| `WHATSAPP_QUEUE_GAP_MIN` / `_MAX` | 3 / 8 | Kuyrukta aynı numaradan iki mesaj arası rastgele boşluk (sn) |
| `WHATSAPP_WORKER_ENABLED` | true | Kuyruk + 5 dk'lık hat sağlık kontrolü uygulama içinde çalışır |

**Giriş kilidi:** aynı telefon (personelde telefon + işletme) için pencere içinde `LOGIN_MAX_FAILURES` hatalı
deneme, ya da aynı IP'den 30'dan fazla hatalı deneme hesabı kilitler; kilitliyken doğru şifre de reddedilir
(HTTP 429 + `Retry-After`). Başarılı girişte o hesabın hatalı kayıtları silinir. Takılan bir kullanıcı için acil
açma: `DELETE FROM login_attempts WHERE key = '<telefon>';` (personelde `'<telefon>:<tenant_id>'`).

**TRUST_PROXY_HEADERS:** nginx gibi bir ters proxy arkasında `true` yapın ve proxy'nin `X-Forwarded-For`'u
**ezdiğinden** (istemciden gelene eklemediğinden) emin olun. Proxy yokken `true` yapmayın; istemci sahte
başlıkla IP sınırını atlatabilir. `false` iken proxy arkasında tüm istekler proxy IP'sinden görünür ve IP sınırı
herkesi birden kilitleyebilir.

## 3. Yedekten geri yükleme

Yedekler `backend/backups/backup_YYYY-MM-DD_HH-MM-SS.sql` düz SQL dosyalarıdır (`pg_dump`).

1. Uygulamayı durdurun (yazma kalmasın).
2. İsterseniz önce mevcut durumun yedeğini alın: `.venv/bin/python scripts/backup_database.py`
3. Boş bir veritabanı oluşturun ve yedeği yükleyin:
   ```
   createdb -h localhost -U <kullanici> behtech_saas_yeni
   psql -h localhost -U <kullanici> -d behtech_saas_yeni -f backups/backup_<tarih>.sql
   ```
4. Satır sayılarını kontrol edin (ör. `SELECT count(*) FROM tenants, appointments...`) ya da önce
   `scripts/verify_backup.py` sonucuna bakın.
5. `.env` içindeki `DATABASE_URL`'yi yeni veritabanına çevirin (ya da eskisini yeniden adlandırıp yenisini
   asıl adla yerleştirin), `alembic upgrade head` çalıştırın, uygulamayı başlatın.
6. Yedek, alındığı andan sonraki verileri içermez; aradaki randevu/ödemeleri işletmelerle doğrulayın.

## 4. "Günlük kontrol çalışmıyor" kontrol listesi

1. **Panel > Sistem**: "Günlük kontrol" kartında son çalışma, sonuç ve hata metni görünür.
   `overdue` uyarısı = son başarılı çalışma 26 saatten eski.
2. Cron tanımlı mı? `crontab -l` ile `run_billing_checks.py` satırını arayın. Cron servisi çalışıyor mu?
3. Elle çalıştırın: `cd backend && .venv/bin/python scripts/run_billing_checks.py`. Çıkış kodu 1 ve `HATA:` satırı
   nedeni söyler (aynı hata `job_runs.error` alanına da yazılır:
   `SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 5;`).
4. Cron ortamı: `cd` ile backend dizinine girildi mi, `.venv` yolu doğru mu, `.env` okunabiliyor mu
   (script çalışma dizinine göre `.env` arar)? Log dosyasının dizini yazılabilir mi?
5. Veritabanına erişim: `DATABASE_URL` doğru mu, PostgreSQL ayakta mı (Sistem sayfasında "Veritabanı" durumu)?
6. Sunucu saat dilimi: 09:00 sunucu yerel saatidir; `date` ile kontrol edin.
7. Bildirimler gitmiyor ama kontrol çalışıyorsa: Sistem > Kanallar (SMTP/VAPID ayarları, abone sayısı).
8. Başarısız son çalışmadan sonra sorun giderildiyse "Kontrolleri şimdi çalıştır" ile doğrulayın.

## 5. Denetim kaydı

Platform panelinde **Denetim kaydı**: giriş/şifre olayları, yönetici, işletme, paket, abonelik, ödeme ve ayar
değişiklikleri ile günlük kontrolün otomatik askıya alma/açma kararları kaydedilir. Parola, token ve IBAN'ın
tamamı kayda yazılmaz. Kayıtlar işletme silinse de kalır.
