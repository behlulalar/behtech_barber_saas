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
   - Frontend tarafı bu kuralın dışında tutulabilir — kullanıcı burada daha
     çok yönlendirme/üretim istiyor, backend kadar katı değil.

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
- **Python:** Orta seviye — fonksiyon/class/decorator kavramlarına hakim.
  FastAPI'ye özgü kavramlar (Depends/dependency injection, Pydantic,
  async/await) sıfırdan ve dikkatli anlatılmalı, temel Python sözdizimi
  anlatılmasına gerek yok.

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
- [ ] Proje iskeleti (FastAPI + klasör yapısı + venv + git init) — şu anki adım
- [ ] Auth & tenant çözümleme (subdomain'den tenant'ı çıkarma, JWT'ye tenant_id ekleme)
- [ ] İş mantığının taşınması (randevu/OTP/webhook/backup)
- [ ] SaaS-owner (platform admin) paneli
- [ ] React frontend
- [ ] Mevcut verinin geçişi
