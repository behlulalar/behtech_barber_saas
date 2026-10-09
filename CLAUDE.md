# Proje: Berber/Kuaför SaaS Dönüşümü

Bu dosya, mevcut tek-dükkân randevu sisteminin (`../randevu/`) çok-kiracılı
(multi-tenant) bir SaaS ürününe dönüştürülmesi projesinin çalışma
kurallarını içerir. Bu dosya her oturumda otomatik yüklenir — burada yazan
kurallar her zaman geçerlidir, kullanıcı aksini söylemediği sürece.

## Çalışma Modu: ÖĞRENME PROJESİ

1. **Sıfırdan öğrenme.** Kullanıcı daha önce SaaS/multi-tenant mimari
   konusunda deneyimli değil. Konuları başlangıç seviyesinden anlatarak
   ilerle — jargonu tanımlamadan kullanma, "neden" kısmını atlama.

2. **Backend kodunu kullanıcı kendisi yazacak.** Kullanıcı daha önce bir FastAPI
   projesini tamamen yapay zekaya yazdırmış ve bundan öğrenme açısından
   memnun kalmamış. Bu projede:
   - Varsayılan davranış: kod bloğunu **ben yazmıyorum**, ne yapılması
     gerektiğini adım adım anlatıyorum (hangi dosya, hangi fonksiyon, hangi
     mantık), kullanıcı kendisi yazıyor.
   - Kullanıcı yazdığı kodu bana gösterip kontrol ettirecek — hataları,
     eksikleri, daha iyi yaklaşımları açıklayarak söylemeliyim (sadece
     "yanlış" demek değil, neden yanlış ve doğrusu ne olmalı).
   - **İstisna:** Kullanıcı açıkça "bunu sen yap" derse, o bölümü ben
     yazarım. Bu izin sadece o an için geçerlidir, sonraki bölümler yine
     öğrenme modunda ilerler.
   - **Kod verme kuralı (2026-09-27'de netleşti, iki aşırı uçtan sonra):**
     Ne (a) kullanıcının satır satır kopyalayabileceği, kendi sistemine özel
     (kendi değişken/fonksiyon adlarıyla) tam kod bloğu ver, ne de (b) hiçbir
     somut ipucu vermeden "bulun" deyip bırak — ikisi de denendi, ikisi de
     başarısız oldu (biri "hiçbir şey öğrenmedim" dedirtti, diğeri kullanıcıyı
     gerçekten kilitleyip sinirlendirdi). Doğru orta yol: kütüphanenin genel
     kullanım kalıbını/syntax'ını **soyut, kullanıcının kendi projesine ait
     olmayan bir örnekle** göster (farklı değişken adları, farklı senaryo)
     — kullanıcı bu kalıbı kendi satırına **kendisi çevirecek**. Fonksiyon/
     class isimlerini bilmiyorsa (ör. `create_async_engine` gibi kütüphaneye
     özgü, tahmin edilemeyecek isimler) doğrudan söylemek sorun değil —
     sorun, kullanıcının kendi dosyasına yazacağı **nihai satırı** onun
     yerine yazmak. Kullanıcı gerçekten kilitlenip sinirlenirse (küfür/öfke
     dahil) hemen orta yolu bırakıp doğrudan yardımcı ol, ısrar etme.
   - Frontend tarafı bu kuralın dışında tutulabilir — kullanıcı burada daha
     çok yönlendirme/üretim istiyor, backend kadar katı değil.
   - **Üç seviyeli tempo (2026-10-02'de netleşti):** Kullanıcı net bir gerilim
     fark etti — her şeyi aynı yoğunlukta elle yazmak hem yorucu hem proje
     bitiş süresini gerçekçi olmayan şekilde uzatıyor, ama tamamen AI'a
     bırakmak da proje hakimiyetini ve öğrenmeyi azaltıyor. Çözüm:
     (1) **Gerçekten yeni bir kavram** (ilk kez görülen bir syntax/mantık) →
     mevcut yavaş/Sokratik tempo, kullanıcı yazar, ipucuyla yönlendirilir.
     (2) **Zaten öğrenilmiş bir kalıbın tekrarı** (benzer dosyalarda/satırlarda
     aynı deseni N kere uygulamak) → tempo hızlandırılır, ben yazıp
     gösterebilirim (kullanıcı okuyup anlar/onaylar, "code review" gibi) —
     ya da "bunu hızlı geçelim mi" diye sorup karar kullanıcıya bırakılır.
     (3) **"Sen yap"** → hâlâ her an kullanılabilir bir çıkış kapısı.
     Kıstas: bir kalıbı kullanıcı 2-3 dosyada bağımsız/doğru şekilde
     uyguladıysa, o kalıp "öğrenilmiş" sayılır, sonraki tekrarlarda yavaş
     tempoda ısrar etmeye gerek yok.

3. **Bir yazılım hocası gibi davran.** Anlatım tarzı: sabırlı, adım adım,
   başlangıç seviyesinde birinin anlayabileceği şekilde. Kod incelerken
   somut, yapıcı geri bildirim ver.

4. **Ürün, prodüksiyona çıkacak ve satılacak.** Bu bir "toy proje" değil —
   güvenlik, ölçeklenebilirlik, kod kalitesi baştan ciddiye alınmalı.
   Frontend tasarımı **özgün olmalı**, tipik/şablon "yapay zeka görünümlü"
   tasarımlardan kaçınılmalı.

## Kararlaştırılan Mimari

- **Backend framework:** FastAPI (Pydantic + SQLAlchemy async + Alembic migration)
- **Multi-tenancy stratejisi:** Shared DB + `tenant_id` (row-level isolation) —
  şema-per-tenant tercih edilmedi (operasyonel karmaşıklık nedeniyle)
- **Tenant çözümleme:** Subdomain tabanlı — `dukkan-adi.behtechlabs.com`.
  Kullanıcının kendi şirket domaini (`behtechlabs.com`) var, marka bilinirliği
  için dükkânlar bu domain altında subdomain olarak yayınlanacak (şu an
  `saleshub.behtechlabs.com` başka bir subdomain olarak kullanımda).
- **Frontend:** React (şu anki 3 ayrı vanilla JS dosyası yerine)
- **Billing/abonelik:** İlk aşamada yok, manuel takip edilecek — sonraya bırakıldı
- **Proje konumu:** `/Users/muhammedbehlulalar/Desktop/berber_saas/saas-app/`
  — `randevu/` klasörü ile aynı üst dizinde, ayrı ve bağımsız bir proje.
  Eski sistem (`../randevu/`) referans/kaynak olarak kullanılacak, üzerine
  yazılmayacak.
- **Dizin yapısı:** Monorepo — `backend/` (FastAPI, app/core/models/schemas/api/services
  ayrımı) + `frontend/` (React) aynı repo içinde.

## Altyapı Durumu

- Domain: `behtechlabs.com` kullanıcının kendi şirket domaini, sahibi
- VPS/sunucu erişimi mevcut (eski sistemde de kullanılan sunucu)
- Git/GitHub deneyimi var

## Kullanıcının Bilgi Seviyesi (öğretim tonunu buna göre ayarla)

- **SQL/veritabanı:** Rahat — tablo tasarımı yapabiliyor. Temel kavramları
  tekrar anlatmaya gerek yok, doğrudan multi-tenant'a özgü kalıplara
  (tenant_id, composite unique constraint, her sorguda tenant filtresi
  disiplini) odaklanılmalı.
- **Python:** Orta seviye — fonksiyon/class/decorator kavramlarına hakim,
  temel sözdizimi anlatılmasına gerek yok.
- **Backend/API geliştirme: SIFIR deneyim.** Kullanıcı daha önce hiç backend
  yazmadı. Bu, "Python biliyor" ile karıştırılmamalı — bir web sunucusunun
  nasıl çalıştığı, request/response döngüsü, connection pool/session gibi
  kavramlar, "neden buna ihtiyacımız var" sorusunun cevabı dahil, **en
  temelden** anlatılmalı. Bir konuyu anlatırken doğrudan "şunu yapacaksın"
  demek yerine önce **hangi problemi çözdüğünü** somut bir senaryoyla
  (mümkünse günlük hayattan bir benzetmeyle) açıklamalı, sonra çözümün
  nasıl işlediğine geçilmeli. Sıralı kavram listesi vermek yetersiz —
  kullanıcı bunu net şekilde belirtti (bkz. 2026-09-27 geri bildirimi).

## Kapsam Dışı Bırakılan Özellikler

- **Değerlendirme/yorum (reviews) sistemi:** MVP'ye dahil edilmeyecek. Ürün
  ucuz bir paket olarak satılacağı için özellik seti bilinçli olarak
  kısıtlı tutuluyor. İleride üst bir plan/paket eklenirse tekrar gündeme
  gelebilir.

## İlerleme Kaydı

- [x] Genel mimari kararları netleşti (bkz. yukarısı)
- [x] Veritabanı şeması tasarımı — TAMAMLANDI (`backend/schema.sql`).
      13 tablo: tenants, staff, customers, services, appointments,
      working_hours, time_off, staff_services, payment_methods,
      verification_codes, webhook_cooldown, platform_admins, tenant_settings.
      `reviews` bilinçli olarak MVP kapsamı dışı bırakıldı (bkz. yukarısı).
      Platform admin kimliği (`platform_admins`) tenant sınırının dışında,
      tenant'a özel ayarlar (`tenant_settings`) one-to-one ilişki olarak
      (`tenant_id` hem PK hem FK) modellendi. WhatsApp sağlayıcısı henüz
      kesinleşmedi (Wapio yerine Evolution API değerlendiriliyor), bu yüzden
      `tenant_settings`'e WhatsApp alanları eklenmedi — karar verildiğinde
      migration ile eklenecek.
- [x] Proje iskeleti (FastAPI + klasör yapısı + venv + git init) — tamamlandı
      GitHub: https://github.com/behlulalar/behtech_barber_saas
      Yerel PostgreSQL: `behtech_saas` veritabanı, `behtech_saas_user`
      kullanıcısı, `schema.sql` çalıştırıldı (13 tablo mevcut).
      `app/core/config.py` (pydantic-settings) ve `app/core/database.py`
      (async engine, session factory, Base, get_db-tarzı fonksiyon) yazıldı
      ve test edildi.
- [x] SQLAlchemy modelleri (`app/models/`) — TAMAMLANDI, 13/13 tablo.
      `tenant.py`, `staff.py`, `customer.py` (class adı `Customers`, çoğul
      kalmış), `service.py` (class adı `Service`, tekil), `appointment.py`
      (en kapsamlı: 4 FK, 2. enum `AppointmentStatus`, 3 sütunlu composite
      UNIQUE, `Date`/`Time` ayrı tipler), `working_hours.py`, `time_off.py`,
      `staff_service.py`, `payment_method.py` (`JSONB` tipi tanıtıldı),
      `verification_code.py` (istisnai olarak ben yazdım — kullanıcı
      yorulduğunu belirtti), `webhook_cooldown.py`, `platform_admin.py`,
      `tenant_settings.py` (istisnai olarak ben yazdım — tenant_id hem PK
      hem FK deseni + `Text` tipi).
      Tüm modeller `Base.metadata.tables` üzerinden toplu doğrulandı (13/13
      tablo doğru kayıtlı). Önemli tekrarlayan öğrenme noktaları: Python'ın
      kendi `enum`/`datetime` tipleri ile SQLAlchemy'nin SQL tipleri
      (`Enum`, `Date`, `Time`, `DateTime`) arasındaki fark ve isim
      çakışmaları (`Enum as SAEnum` alias'ı), `Mapped[]` içine her zaman
      Python tipi, `mapped_column()` içine her zaman SQL tipi yazılması
      kuralı, `true`/`false` (SQLAlchemy SQL ifadeleri, `server_default`
      için) ile Python'ın `True`/`False` (ör. `unique=True` gibi düz
      parametreler için) karıştırılmaması.
      Not: Her modeli tek başına `CreateTable(...).compile(...)` ile test
      ederken, foreign key verdiği tablonun modeli de import edilmiş
      olmalı yoksa "NullType" hatası alınır (ilişkili modelleri birlikte
      import etmek gerekiyor) — bu bir bug değil, test şeklinin doğal
      sonucu.
- [x] Alembic kurulumu — TAMAMLANDI. `env.py` modellere (`Base.metadata`,
      `app/models/__init__.py` ile tüm 13 model tek importla yükleniyor)
      ve `.env`'deki `DATABASE_URL`'e bağlandı (asyncpg → psycopg2 çevirisi
      ile, Alembic sync çalıştığı için `config.set_main_option(...)`
      kullanıldı). İlk migration (`7efb0e9dab46`) oluşturulup uygulandı —
      sadece `tenant_settings.notification_banner_enabled` için `NOT NULL`
      ekledi (model ile schema.sql arasındaki tek gerçek fark buydu).
      Modellere eksik olan 10 performans index'i (`Index(...)`,
      `__table_args__` içinde) eklendi — eklenmeseydi ilk autogenerate
      onları veritabanından silecekti, önemli bir ders oldu. Doğrulama:
      ikinci bir autogenerate denemesi tamamen boş migration üretti
      (`pass`/`pass`) — modeller ve veritabanı artık birebir aynı.
- [x] FastAPI uygulamasının asıl iskeleti — TAMAMLANDI. `app/main.py`:
      `FastAPI()` nesnesi, `/health` (basit), `/tenants` (gerçek DB
      sorgusu, `Depends(get_db)` + `select(Tenant)` + `await db.execute()`
      + `.scalars().all()`). `database.py`'deki fonksiyonun gerçek adının
      `kaynak_fonksiyonu` kaldığı fark edildi (önceki derslerde hep
      `get_db` denmişti ama isim hiç değiştirilmemişti) — `get_db` olarak
      yeniden adlandırıldı. `uvicorn --reload` ile uçtan uca test edildi
      (gerçek Postgres satırıyla), ham ORM nesnesinin Pydantic şeması
      olmadan da JSON'a çevrildiği görüldü — ama bunun `password` gibi
      hassas alanları da dışarı sızdırabileceği fark edildi, bu yüzden
      sıradaki adım Pydantic şemaları.
- [x] Pydantic şemaları (`app/schemas/`) — TAMAMLANDI (ilk örnek:
      `TenantOut`, `model_config = ConfigDict(from_attributes=True)` ile
      ORM nesnelerinden okunabiliyor). `/tenants` route'una
      `response_model=list[TenantOut]` eklendi, test edildi.
- [x] Auth & tenant çözümleme — TAMAMLANDI.
      `app/core/security.py` tamamlandı: `hash_password`/`verify_password`
      (passlib + bcrypt, `bcrypt==4.0.1`'e sabitlendi), `create_access_token`/
      `decode_access_token` (pyjwt).
      `POST /auth/login` çalışıyor (`app/schemas/auth.py`:
      `LoginRequest`/`TokenResponse`) — request body'de geçici olarak
      `tenant_slug` alanı var (subdomain çözümlemesi henüz kurulmadı,
      o kurulunca bu alan kaldırılıp otomatik hale gelecek). Tenant'ı
      slug'a göre, sonra personeli phone+tenant_id'ye göre buluyor,
      `scalar_one_or_none()` + `HTTPException` kullanılıyor.
      ÖNEMLİ BUG BULUNDU VE DÜZELTİLDİ: SQLAlchemy'nin `Enum(...)` tipi
      varsayılan olarak DB'deki string'i Python enum'unun **değerine**
      değil **ismine** göre eşleştiriyor (`RoleType.STAFF`'ın ismi
      `STAFF`, değeri `staff` — DB'de `staff` küçük harfle duruyor).
      Hem `staff.py` (`RoleType`) hem `appointment.py`
      (`AppointmentStatus`) için `SAEnum(...)`'a
      `values_callable=lambda enum_class: [m.value for m in enum_class]`
      eklendi. Gerçek bir test tenant+staff ile uçtan uca doğrulandı
      (doğru/yanlış şifre, var olmayan tenant).
      `app/core/deps.py` eklendi: `get_current_staff` dependency'si —
      `OAuth2PasswordBearer` ile `Authorization: Bearer ...` header'ından
      token'ı otomatik çekiyor, `decode_access_token` ile çözüyor
      (`jwt.InvalidTokenError` `try`/`except` ile yakalanıp 401'e
      çevriliyor — bozuk/sahte token başta 500 hatası veriyordu, bunu
      yakaladık), `sub` claim'inden `staff_id`'yi bulup veritabanından
      `Staff`'ı çekiyor. `GET /auth/me` ile korumalı ilk route test
      edildi (`StaffOut` şeması, `password` alanı dışarı sızmıyor).
      Gerçek tenant/staff ile uçtan uca doğrulandı: token'sız istek →401,
      sahte token →401, geçerli token → doğru kullanıcı bilgisi.
      Subdomain'den tenant çözümleme de TAMAMLANDI: `deps.py`'ye
      `get_current_tenant` eklendi — FastAPI'nin `Request` nesnesiyle
      `Host` header'ı okunuyor, port varsa kırpılıyor, `settings.base_domain`
      suffix'i çıkarılıp subdomain (`slug`) elde ediliyor, `Tenant`
      tablosunda aranıyor (host hatalıysa 400, tenant yoksa 404).
      `LoginRequest`'ten `tenant_slug` alanı kaldırıldı, `login` route'u
      artık `Depends(get_current_tenant)` kullanıyor. `curl`'de `Host`
      header'ı elle verilerek (gerçek DNS olmadan) üç senaryo doğrulandı:
      doğru subdomain → başarılı login, var olmayan subdomain → 404,
      subdomain yok (çıplak domain) → 400.
      **Auth & tenant çözümleme fazı tamamen bitti.**
- [~] İş mantığının taşınması — devam ediyor. Alt sıra: (1) herkese açık
      listeleme ✅, (2) müsaitlik kontrolü, (3) randevu oluşturma,
      (4) OTP akışı, (5) webhook/yedekleme.
      (1) TAMAMLANDI: `GET /staff` ve `GET /services`, ikisi de
      `Depends(get_current_tenant)` ile scope'lanıyor. `services`
      ayrıca `is_active == True` ile filtreleniyor (pasif hizmetler
      müşteri tarafında görünmemeli). `app/schemas/service.py`
      (`ServiceOut`) eklendi. Gerçek tenant/staff/services verisiyle
      test edildi (pasif hizmetin filtrelendiği doğrulandı).
- [ ] SaaS-owner (platform admin) paneli
- [ ] React frontend
- [ ] Mevcut verinin geçişi
