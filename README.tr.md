<p align="center">
  <img src="docs/assets/logo.png" alt="Beyond The Code" width="420">
</p>

<h1 align="center">BehTech Barber SaaS</h1>

<p align="center">
  Berber ve kuaförler için çok kiracılı (multi-tenant) randevu sistemi.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.tr.md">Türkçe</a>
</p>

---

## Genel Bakış

Bu proje, tek bir dükkân için tasarlanmış bir randevu sisteminin, gerçek bir
çok kiracılı (multi-tenant) SaaS ürününe sıfırdan dönüştürülmesidir. Her
berber dükkânı ("tenant") kendi izole verisine ve kendi markalı subdomain'ine
(`dukkan-adi.behtechlabs.com`) sahip olurken, platform sahibi tüm dükkânları
tek bir kod tabanı ve tek bir veritabanı üzerinden yönetir.

Eski tek-dükkânlı sistem (Flask + vanilla JS) referans olarak korunuyor; bu
repo o sistemin bir taşıması değil, sıfırdan yeni bir uygulamadır.

## Teknoloji Yığını

| Katman         | Teknoloji                                                  |
|----------------|--------------------------------------------------------------|
| Backend        | FastAPI, Python 3.14                                          |
| ORM            | SQLAlchemy 2.0 (async), migration için Alembic                |
| Veritabanı     | PostgreSQL                                                     |
| Kimlik Doğrulama | JWT (PyJWT), bcrypt (passlib)                                |
| Yapılandırma   | pydantic-settings (`.env` tabanlı)                              |
| Frontend       | React (planlanıyor — eski vanilla JS panellerin yerini alacak)   |

## Mimari

- **Multi-tenancy:** Paylaşımlı veritabanı, her tenant'a özel tabloda bir
  `tenant_id` sütunu ile satır bazlı izolasyon (tenant başına ayrı şema
  yerine) — bu aşamada operasyonel basitlik gözetilerek tercih edildi.
- **Tenant çözümleme:** Subdomain tabanlı — `dukkan-adi.behtechlabs.com` —
  her istekte çözümlenip JWT'ye taşınıyor.
- **Platform admin:** Herhangi bir tenant'a bağlı olmayan, ayrı bir kimlik
  (`platform_admins`) tenant sınırının dışında durur ve tüm tenant'ları
  yönetebilir.

## Veritabanı Şeması

13 tablo, hem ham SQL olarak (`backend/schema.sql`, orijinal tasarım
referansı) hem de SQLAlchemy modelleri olarak (`backend/app/models/`) tam
şekilde tanımlı:

`tenants`, `staff`, `customers`, `services`, `appointments`,
`working_hours`, `time_off`, `staff_services`, `payment_methods`,
`verification_codes`, `webhook_cooldown`, `platform_admins`, `tenant_settings`.

## Proje Yapısı

```
saas-app/
├── backend/
│   ├── app/
│   │   ├── core/        # config, veritabanı engine/session, güvenlik
│   │   ├── models/       # SQLAlchemy modelleri (tablo başına bir dosya)
│   │   ├── schemas/       # Pydantic request/response şemaları
│   │   ├── api/            # route handler'ları
│   │   └── services/       # iş mantığı
│   ├── alembic/            # veritabanı migration'ları
│   └── schema.sql           # referans SQL şeması
└── frontend/                # React uygulaması (planlanıyor)
```

## Durum

🚧 Aktif geliştirme aşamasında. Veritabanı şeması ve SQLAlchemy modelleri
tamamlandı; API katmanı ve frontend üzerinde çalışılıyor. Henüz
prodüksiyona hazır değil.

## Lisans

Özel mülk — tüm hakları saklıdır. Bu, geliştirme aşamasında ticari bir
üründür; kaynak kodu yeniden kullanım için lisanslanmamıştır.
