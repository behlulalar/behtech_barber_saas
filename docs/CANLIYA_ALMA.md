# Canlıya Alma Kontrol Listesi

> **Bu dosya ne için?** Yeni bir sohbette Claude'a "önce `docs/CANLIYA_ALMA.md` ve `docs/EKSIKLER.md` dosyalarını oku, sonra
> canlıya alma adımlarını yapalım" demen yeterli. Her madde tek başına yapılabilecek şekilde yazıldı.
> Kutucukları (`[ ]` → `[x]`) iş bitince işaretleyin. Son güncelleme: 2026-10-15.
>
> Tamamlayıcı dosyalar: `docs/EKSIKLER.md` (henüz yapılmamış özellikler ve bilinen eksikler),
> `docs/OPERATIONS.md` (cron, yedek, ortam değişkenleri), `deploy/crontab.example`, `CLAUDE.md` (proje geçmişi ve kararlar).

Proje: FastAPI + PostgreSQL (backend) ve React/Vite (frontend), çok kiracılı (multi-tenant). Dükkân, **Host başlığından**
tanınır: `<slug>.behtechlabs.com`. Ürünün tanıtım sitesi `randevu.behtechlabs.com`. Tüm API `/api` altında.

---

## 0. DURDURUCU ENGELLER (bunlar olmadan canlıya çıkılamaz)

- [ ] **WhatsApp: her dükkân kendi numarasını bağlar** (platform ortak hat vermez). Canlıda bağlı olmayan dükkânın müşterisi doğrulama kodu alamaz → online randevu alamaz.
  - Kod HAZIR (2026-10-16): `whatsapp_connections` tablosu, panel WhatsApp Bağlantısı sayfası kartı (QR / eşleştirme kodu), `otp_delivery` dükkânın instance'ından gönderir, webhook `?token=` ile durum günceller. Yerel Evolution v2.3.7'ye karşı QR/eşleştirme kodu/webhook kurulumu doğrulandı.
  - Kalan: gerçek bir telefonla bağlayıp kod gönderimini uçtan uca denemek (bkz. §6).
- [ ] **Migration zinciri BOŞ veritabanında çalışmıyor.** İlk migration (`7efb0e9dab46`) `tenant_settings` tablosunu var sayıyor (tablolar
  `backend/schema.sql` ile kurulmuştu). Yeni sunucuda sırayla: `psql -f backend/schema.sql` → `alembic upgrade head`.
  (Test altyapısı da böyle yapıyor: `backend/tests/bootstrap_db.py`.) Kalıcı çözüm: baseline migration (bkz. `EKSIKLER.md` §Teknik).
- [ ] **Gerçek parolalar/sırlar.** Geliştirmede her şey `123456`. Bkz. §3.
- [ ] **Sahte (mock) verinin tamamının temizlenmesi.** Bkz. §4.

---

## 1. Sunucu ve altyapı

- [ ] **DNS:** `*.behtechlabs.com` için wildcard A kaydı sunucuya; `randevu.behtechlabs.com` (tanıtım sitesi) de aynı sunucuya.
  Dikkat: `saleshub.behtechlabs.com` başka bir uygulamada kullanılıyor (rezerve slug listesinde), wildcard ile çakışmasın — özel kayıt öncelikli olmalı.
- [ ] **HTTPS (wildcard sertifika):** Her dükkân ayrı alt alan adı olduğu için wildcard gerekir. Let's Encrypt **DNS-01** doğrulaması
  (certbot + DNS sağlayıcı eklentisi). Web push (PWA bildirimi) ve Service Worker **HTTPS zorunlu** kılar.
- [ ] **Python 3.14** (geliştirmede 3.14.3 kullanıldı; sunucuda aynı sürümü kullanın ya da 3.12+ ile `pytest` koşturup doğrulayın).
  `requirements.txt` sürümleri SABİTLENMEMİŞ (fastapi, uvicorn…): kurulumdan önce çalışan ortamdan `pip freeze` ile sabitleyin.
  `bcrypt==4.0.1` bilerek sabit (passlib uyumu).
- [ ] **Uygulama süreci:** `uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 2` (systemd servisi). **`--reload` KULLANMAYIN.**
  `backend/.env` dosyası sunucuda oluşturulur (repoda yok, `.gitignore` içinde).
- [ ] **Nginx ters vekil:**
  - `/api/` → `http://127.0.0.1:8001`, **`proxy_set_header Host $host;`** (backend dükkânı Host başlığından çözer — bu satır olmazsa her şey 404/400 verir),
    `X-Forwarded-For` ve `X-Forwarded-Proto` iletin.
  - Diğer tüm yollar → `frontend/dist` (SPA): `try_files $uri /index.html;` — **her alan adı için** (dükkân siteleri, `randevu.`, `/panel`, `/platform`).
  - Önbellek: hash'li `assets/*` uzun süre; `index.html` ve `sw.js` **no-cache**. gzip/brotli açık.
  - Frontend ve API aynı alan adından sunulduğu için CORS gerekmez (backend CORS tanımlamaz).
- [ ] **`TRUST_PROXY_HEADERS=true`** (`backend/.env`): Nginx arkasında bu açılmazsa her istek vekil IP'sinden geliyor görünür ve
  giriş sınırının "aynı IP'den 30 başarısız deneme" kuralı **tüm kullanıcıları kilitleyebilir**. Nginx'in dışarıdan gelen
  `X-Forwarded-For` başlığını ezdiğinden (`$remote_addr`) emin olun, yoksa IP sahtelenebilir.
- [ ] **Saat dilimi:** Backend `datetime.now()` / `date.today()` (31 yerde, saat dilimsiz) kullanıyor; randevu saatleri "duvar saati".
  Sunucu **`Europe/Istanbul`** (`timedatectl set-timezone Europe/Istanbul`) olmalı ve PostgreSQL `timezone` aynı olmalı. UTC kalırsa
  "geçmiş saat", "bugün", günlük kontrol ve slotlar 3 saat kayar.
- [ ] **Güvenlik duvarı:** yalnızca 80/443 (ve SSH) açık; 5432 (PostgreSQL), 8001 (uvicorn), 8080 (Evolution) dışarı kapalı.
- [ ] **Swagger/OpenAPI kapatma:** `FastAPI(title=...)` varsayılan olarak `/docs` ve `/openapi.json` açıyor → production'da kapatın
  (`docs_url=None, redoc_url=None, openapi_url=None` ya da Nginx'te engelleyin).
- [ ] **HTTP güvenlik başlıkları (Nginx):** `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, makul bir `Content-Security-Policy` (Google Fonts `fonts.googleapis.com`/`fonts.gstatic.com` kullanılıyor;
  görseller `data:` URL; Unsplash artık kullanılmıyor).
- [ ] **İstek hız sınırı (Nginx `limit_req`):** özellikle `/api/auth/send-code`, `/api/auth/login`, `/api/platform/login`. (Uygulama içi sınırlar var ama ilk savunma hattı bu olmalı.)
- [ ] **Log döndürme** (logrotate) ve uvicorn/Nginx günlükleri.

## 2. Veritabanı

- [ ] PostgreSQL sunucusu kur; veritabanı + **en az yetkili uygulama kullanıcısı** (CREATEDB/SUPERUSER **YOK**).
- [ ] Şema: `psql -f backend/schema.sql` ardından `cd backend && .venv/bin/alembic upgrade head` (şu an head: `f1a2b3c4d5e6`).
  Doğrulama: `alembic check` temiz olmalı; `alembic current` head göstermeli.
- [ ] **Ayrı bakım kullanıcısı** (yedek doğrulaması için): `CREATE ROLE behtech_maint LOGIN CREATEDB PASSWORD '…'`; cron ortamına
  `BACKUP_VERIFY_DB_USER` / `BACKUP_VERIFY_DB_PASSWORD` yazın. **Uygulama kullanıcısına CREATEDB vermeyin.**
  (Bu değerleri `backend/.env` içine YAZMAYIN: ayar sınıfı bilinmeyen anahtarı reddeder ve uygulama açılmaz — sadece cron/ortam değişkeni.)
- [ ] `pg_dump`/`psql` istemci araçları sunucuda kurulu olmalı (yedek scriptleri kullanıyor).

## 3. Sırlar ve parolalar (`backend/.env`)

Üretimde `.env` içinde olması gerekenler (örnek anahtarlar: `backend/.env.example`):

- [ ] `ENVIRONMENT=production` — **kritik:** `development` dışında OTP kodu API yanıtında dönmez ve sabit OTP devre dışı kalır.
- [ ] `OTP_FIXED_CODE` satırını **SİLİN** (geliştirmede `123456`). (Yalnızca `development` iken etkili ama yine de kaldırın.)
- [ ] `JWT_SECRET` → yeni, uzun, rastgele (≥ 64 karakter). Değişince tüm oturumlar düşer (sorun değil).
- [ ] `DATABASE_URL` (asyncpg), `BASE_DOMAIN=behtechlabs.com`, `DAILY_APPOINTMENT_LIMIT`, `OTP_EXPIRATION_SECONDS`, `ACCESS_TOKEN_EXPIRE_MINUTES`.
- [ ] `TRUST_PROXY_HEADERS=true` (§1), `LOGIN_MAX_FAILURES=5`, `LOGIN_LOCK_MINUTES=15` (varsayılanlar uygundur).
- [ ] **SMTP:** `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=behlulalar@behtechlabs.com`, `SMTP_PASSWORD=<Google uygulama şifresi>`,
  `SMTP_FROM`, `SMTP_STARTTLS=true`. (Geliştirmede kuruldu ve test e-postası gitti.) Platform → Ayarlar → "Bildirim e-postası" dolu olmalı.
- [ ] **VAPID** (web push): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:…`. Geliştirme anahtarları `backend/.env` içinde;
  üretim için **yeniden üretin** (`py-vapid` ile) — özel anahtar paylaşılmamalı. Yenileyince eski push abonelikleri geçersiz olur (sorun değil).
- [ ] **Evolution API:** `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY` (yeni, güçlü), `EVOLUTION_INSTANCE_NAME`.
- [ ] **Platform yöneticisi parolası:** geliştirme hesabı `5000000000 / 123456` — **kullanmayın.** Üretimde yeni yönetici oluşturun:
  `cd backend && .venv/bin/python scripts/create_platform_admin.py --name "Ad Soyad"` (telefon/parola ister), girişten sonra geliştirme hesabını
  Platform → Yöneticiler'den silin/pasife alın. Parola politikası: ≥ 8 karakter, telefona eşit değil, yaygın parola değil.
- [ ] Tüm dükkân sahibi/personel parolaları gerçek olmalı (geliştirmede hepsi `123456`, telefonlar `5111111111/5222222222/5333333333`).
- [ ] **`.env` dosyalarının git'e girmediğini doğrulayın** (`git log --all -- backend/.env` boş olmalı). Evolution API'nin `.env`'i repo dışında (`../evolution-api/.env`).

## 4. Veri temizliği (sahte/test verisi)

Geliştirme veritabanında SADECE demo/sahte veri var (kullanıcı kararı, 2026-10-15). Canlı veritabanı **temiz** kurulmalı; geliştirme DB'sini kopyalamayın.

- [ ] Yeni, boş veritabanından başlayın (§2). Aşağıdakiler yalnızca geliştirme ortamındadır, canlıya TAŞINMAMALI:
  - Dükkânlar: `sefapertev`, `demo`, `deneme`, `denemee`, `ustamakas`, `keskinberber`, `egekuafor`, `merkezberber`, `baslangic`, `yenigelen`.
  - Sahte müşteriler: telefonu `54000000NN` biçiminde olanlar; sahte abonelik/ödemeler; sahte platform ayarları (IBAN `TR33 0006 1005 1978 6457 8413 26` ÖRNEK).
- [ ] **Seed script'lerini sunucuya kurmayın / çalıştırmayın.** `seed_mock_data.py` ve `seed_mock_billing.py` `ENVIRONMENT != development` iken çalışmayı reddeder;
  **ama `scripts/seed_demo.py`'de bu koruma YOK** (demo dükkânı silip yeniden yaratır ve `5000000000/platform1234` yöneticisini ekler) → sunucudan kaldırın ya da koruma ekleyin.
- [ ] **Gerçek müşteri (Sefa Pertev) verisi:** eski sistemin gerçek verisi `sefa_db` (yerel PostgreSQL) içinde ve `scripts/migrate_old_data.py` ile bir kez taşınmıştı.
  Geliştirme verisi sonradan sahteyle karıştırıldı. Canlıya çıkarken **gerçek Sefa verisi tekrar taşınacak mı, yoksa temiz mi başlanacak?** — karar bekliyor.
  Taşınacaksa `migrate_old_data.py` çalıştırılır ve telefonlar `5XXXXXXXXX` biçimine getirilir (sistem 10 haneli, başında 0 olmayan numara bekler).
- [ ] İlk gerçek işletmeleri **Platform → İşletmeler → Yeni işletme** ile oluşturun (sahip hesabı birlikte oluşur), sonra her birinde: hizmetler,
  personel + çalışma saatleri + hizmet atamaları, ödeme yöntemleri, adres/logo girilmeli. (Kurulum kontrol listesi özelliği henüz yok — bkz. `EKSIKLER.md`.)
  Sık hata: personelin çalışma saati/hizmeti yoksa müşteri sitesinde o personelden randevu alınamaz.

## 5. Uygulama kurulumu

- [ ] `git clone` → `backend`: `python -m venv .venv`, `pip install -r requirements.txt` (+ sabitlenmiş sürümler).
- [ ] `frontend`: `npm ci` → `npm run build` → `dist/` Nginx'e. (`vite.config.ts` içindeki `/api` vekili yalnızca geliştirme içindir.)
- [ ] Systemd servisi + `deploy/crontab.example` (günlük kontrol 09:00, yedek 03:00, haftalık yedek doğrulama). Detay: `docs/OPERATIONS.md`.
- [ ] Testleri sunucuda ya da CI'da bir kez koşturun: `cd backend && bash scripts/run_tests.sh` (223 test geçmeli, 1 xfail). Ayrı `behtech_saas_test` veritabanı gerekir.
- [ ] Platform panelinde **Ayarlar**: gerçek IBAN, alıcı adı, banka, hatırlatma günü (3), ek süre (7), şablonlar; **Paketler**: gerçek liste fiyatları
  (geliştirmede Aylık 850 / 6 Aylık 4.250 / Yıllık 8.500 ₺ — senin girdiğin değerler, doğrula).
- [ ] **Tanıtım sitesi içeriği:** `frontend/src/pages/product/content.ts` → `CONTACT.whatsapp` ve `CONTACT.email` **boş**; doldurulmazsa "Demo talep et" yalnızca demo bağlantısı gösterir.
  `DEMO_SITE_URL` canlıda `https://demo.behtechlabs.com/` — bu dükkânın canlıda var olması (ya da adresin değiştirilmesi) gerekir.
- [ ] Tanıtım sitesi SEO: `<title>/<meta description>`, Open Graph görseli, `robots.txt`, `sitemap.xml` (şu an yok). Dükkân siteleri için de `robots`/başlık kararı.
- [ ] Platform PWA: HTTPS altında telefona kur (iPhone: Safari → Paylaş → Ana Ekrana Ekle, iOS 16.4+), Ayarlar'dan bildirimi aç, "Test bildirimi" gönder.
  **Gerçek bir cihazda hiç denenmedi.**

## 6. WhatsApp (Evolution API) altyapısı

Evolution sunucusu platformun altyapısıdır (repo dışında `../evolution-api/`, kendi Postgres'iyle). **WhatsApp hesapları dükkânlarındır:** her dükkânın ayrı instance'ı (`bt<tenant_id>-<slug>`) vardır, sahip panelden bağlar.

- [ ] Evolution **v2.3.7+** kullanın (v2.1.1 güncel WhatsApp Web sürümüyle QR üretemiyordu; 2026-10-16'da yükseltildi). Docker, güçlü `AUTHENTICATION_API_KEY`, dışarıya KAPALI (`127.0.0.1:8080`, yalnızca backend erişir).
- [ ] Backend `.env`: `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY` (= Evolution'ın `AUTHENTICATION_API_KEY`), `EVOLUTION_WEBHOOK_URL` (canlıda Evolution'ın backend'e ulaştığı iç adres, ör. `http://127.0.0.1:8001/api/webhooks/evolution`), `EVOLUTION_WEBHOOK_SECRET` (uzun rastgele). `EVOLUTION_INSTANCE_NAME` artık kullanılmıyor.
- [ ] Webhook yolu Nginx'te dışarı AÇILMAMALI ya da yalnızca token ile çalıştığından emin olun (token yoksa 401).
- [ ] İlk dükkânda uçtan uca deneme: WhatsApp Bağlantısı sayfası'ı bağla → telefondan okut → durum "Bağlı" → "Test mesajı gönder" → müşteri sitesinden kod iste.
- [ ] Platform → Sistem: "Evolution sunucusu: Erişilebilir", "WhatsApp'ı bağlı işletme: N".
- [ ] Ban riski artık dükkân başına (her biri kendi numarası); işletme başına saatlik sınır (`WHATSAPP_TENANT_HOURLY_LIMIT`) yine geçerli.

## 7. Yasal ve operasyonel

- [ ] **KVKK:** Müşteri telefon/ad verisi işleniyor. Aydınlatma metni, gizlilik politikası, kullanım şartları (hem tanıtım sitesi hem dükkân müşteri sitesi için);
  randevu alırken açık rıza/aydınlatma bağlantısı. İşletme (veri sorumlusu) ile BehTech (veri işleyen) arasında hizmet/veri işleme sözleşmesi. Henüz hiçbiri yok.
- [ ] Ödeme şu an **IBAN/havale ile elle** takip ediliyor (sistem tahsilat yapmaz). Resmileşince: fatura/e-fatura/makbuz (bkz. `EKSIKLER.md`).
- [ ] **Yedek:** cron çalışıyor + **bulut/uzak kopya** (rclone → S3/Drive; henüz yok) + **geri yükleme tatbikatı** (en az bir kez gerçekten geri yükleyip uygulamayı açın).
  Platform → Sistem sayfası: yedek "Güncel" ve doğrulama "başarılı" olmalı.
- [ ] **İzleme:** uptime (UptimeRobot vb.), hata izleme (Sentry vb.), disk/DB boyutu uyarısı. Henüz yok. Platform → Sistem sayfası günlük kontrol 26 saati aşarsa uyarır ama dışarı bildirim göndermez.
- [ ] Destek süreci: işletme sahibi parolayı unutursa ne olacak? (Şu an platformdan sıfırlama yok — bkz. `EKSIKLER.md` Aşama B.)

## 8. Canlıya çıkış sonrası ilk gün kontrolleri

- [ ] `https://randevu.behtechlabs.com/` açılıyor; bir test dükkânı `https://<slug>.behtechlabs.com/` açılıyor, HTTPS kilidi tam.
- [ ] Müşteri akışı: randevu al → WhatsApp'tan OTP geldi mi → randevu onaylı düştü → "Giriş yap" ile başka cihazdan girip iptal.
- [ ] Panel: sahip girişi, personel girişi (yetkiler: personel gelir/ayar/hizmet göremez), randevu tablosu, gelir raporu.
- [ ] Platform: giriş (kilit mesajı çalışıyor mu), yeni işletme ekle, abonelik dönemi/ödeme, "Kontrolleri şimdi çalıştır", Sistem sayfasında her şey yeşil.
- [ ] Cron ertesi gün çalıştı mı (Sistem → Günlük kontrol "Cron" tetikleyen, yedek yeni).
- [ ] Gizli sızıntı kontrolü: `/docs` kapalı mı, 5432/8001/8080 dışarıdan erişilemiyor mu, `view-source` içinde sır yok mu.
