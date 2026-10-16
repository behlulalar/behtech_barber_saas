# Eksikler, Bilinen Sorunlar ve Yapılacaklar

> **Bu dosya ne için?** Henüz YAPILMAMIŞ özellikler, bilinen eksikler ve verilmiş kararlar. Yeni bir sohbette Claude'a
> "`docs/EKSIKLER.md` ve `docs/CANLIYA_ALMA.md` dosyalarını oku, X maddesini yapalım" demen yeterli.
> Bir madde bitince buradan silin ya da `[x]` yapıp tarih ekleyin. Son güncelleme: 2026-10-15.
> Canlıya çıkış adımları ayrı dosyada: `docs/CANLIYA_ALMA.md`.

Öncelik: **P0** canlı için şart · **P1** ilk müşterilerle birlikte · **P2** büyürken · **P3** fikir/ileride.

---

## 1. Verilmiş kararlar (tekrar sorulmasın)

- **Kullanıcı kod yazma modu:** 2026-10-13'ten beri "sen yap, hızlı bitir" (öğrenme modu kapalı). Ajanlarla yazılan kodlar kullanıcının elle yazdığı kod DEĞİL
  (LinkedIn "build in public" yazılarında dürüstçe belirtilmeli; bkz. `CLAUDE.md`).
- **Token tasarrufu:** kullanıcı kullanım limitini yakından izliyor → az ajan (en fazla backend + frontend), az ekran görüntüsü, işleri topla. (Bellek notu: `token-economy`.)
- **Ödeme:** ilk aşamada IBAN/havale, sistem tahsilat yapmaz; resmileşince altyapı eklenecek.
- **WhatsApp — KARAR (2026-10-16):** Platform ortak WhatsApp hattı VERMEZ. **Her dükkân sahibi kendi WhatsApp hesabını panelden bağlar** (Ayarlar → WhatsApp: QR ya da "telefon numarasıyla bağla" eşleştirme kodu); o dükkânın müşteri doğrulama kodları ve personel şifre sıfırlama kodları dükkânın KENDİ numarasından gider. Evolution sunucusu (altyapı) platformdadır, numaralar dükkânlarındır. Bağlı değilse müşteri online kod alamaz (müşteri sitesi "işletmeyi arayın" der; kurulum rehberinde engelleyici adım). Platform sahibinin işletmelerle iletişimi ise WhatsApp API değil **`wa.me` bağlantısı + hazır şablon**.
- **Randevu onayı yok:** randevu doğrudan `confirmed` oluşur (akış: confirmed → completed / no_show / cancelled). `pending` DB enum'unda duruyor ama üretilmiyor.
- **Slotlar:** 30 dakika, yalnızca :00/:30; hizmet süresi 30'un katı; berberin kendi hizmet listesi (`staff_services`) zorunlu.
- **Personel yetkisi:** personel yalnızca Genel Bakış (cirosuz), Randevular (kendi), Müşteriler (yalnızca kendi randevusu olanlar) ve Ekip (salt okunur, meslektaş telefonları gizli) görür.
  Gelir raporu, ayarlar, hizmet/ödeme yöntemi/çalışma saati/izin düzenleme yalnızca yöneticide.
- **"İşletme olarak gir" (destek) — KARAR:** Platform yöneticisi destek için işletme panelini açabilecek. **Varsayılan: müdahaleye AÇIK (tam yetki)** — örn. işletme adına
  WhatsApp QR bağlantısı gibi işlemler gerekebilir. Güvenlik şartları: her giriş **denetim kaydına yazılır** (kim, hangi işletme, ne zaman, kaç dakika), panelde belirgin
  "Destek modu — Platform yöneticisi olarak görüntülüyorsunuz [Çık]" şeridi, kısa ömürlü token, işlemler "destek modunda yapıldı" etiketiyle denetim kaydına düşer.
  (İsteğe bağlı küçük ekleme: girişte "yalnızca görüntüle" kutusu.) Tasarım notu: token'lar origin başına localStorage'da → alt alan adları arası taşıma için **tek kullanımlık,
  60 sn ömürlü kod** (`POST /platform/tenants/{id}/impersonate` → kod; dükkân tarafı `POST /api/auth/impersonate {code}` ile token'a çevirir).
- **Deneme süresi — KARAR:** 14 günlük deneme. **Ek süre (grace) YOK.** Bitmeye yakın (ör. 3 gün kala) müşteriye **"Devam etmek istiyor musunuz?"** mesajı gönderilir
  (platform sahibi için `wa.me` şablonu + bildirim). Müşteri ücretli döneme geçmezse deneme bittiği anda işletme **otomatik askıya alınır** (veri silinmez).
  Deneme geliri (MRR) sayılmaz; "denemeden ücretliye dönüşüm oranı" metriği tutulur. Uygulama fikri: `subscriptions.is_trial` + yeni `trial` durumu + üçüncü mesaj şablonu
  (`trial_template`) + günlük kontrolde "deneme bitti → askıya al" kuralı (mevcut ek süre kuralı deneme dönemlerine uygulanmaz).
- **Platform büyüme planı:** şimdilik tek yönetici; ileride bir takip/destek elemanı alınabilir → ikinci yönetici, denetim kaydı ve (ileride) salt okunur yönetici rolü hazır/planlı.
  Hedef: 10–25 işletme rahat yönetilsin; 50–100'e ölçeklenebilir tasarım.

---

- **Aşama D kararları (2026-10-16):** paket limitleri/özellik bayrağı YOK (tek paket, her özellik açık); özel alan adı ve çoklu şube YOK (gerek yok).
  Yapılacak: WhatsApp durum paneli + işletme başına hız sınırı; duyuru (yalnızca panel banner'ı, WhatsApp'a gönderim yok); indirim (kod yok — abonelik oluştururken/yenilerken elle yüzde girilir, dönem fiyatı = liste − indirim).
- **Kayıt ol (2026-10-16):** `POST /api/public/signup` -> işletme `signup_status='pending'`, `is_active=false`; platform onaylarsa (`/platform/tenants/{id}/signup/approve`) 14 günlük deneme başlar, reddederse kapalı kalır. Doğrulama yok (OTP'siz), spam için IP başına 5 kayıt/gün + telefon başına tek aktif başvuru. Bildirim: e-posta (platform ayarlarındaki bildirim e-postası) + web push. Başvurular platform menüsünde ayrı sayfada (`/platform/basvurular`, kart görünümü, rozetli); İşletmeler listesinde bekleyenler görünmez. Boş işletme gelir; kurulum rehberi panelde.

## 2. Platform paneli (Aşama B / C / D)

Aşama A (giriş kilidi, yöneticiler, denetim kaydı, sistem sayfası, testler) **tamamlandı** (commit `8e5f8f5`, `c1467e0`).

### Aşama B — İşletme yönetimi ve ölçek (sıradaki)
- [x] (2026-10-15, commit B-1) ~~Sunucu tarafı sayfalama/arama/sıralama~~ **işletme listesi için YAPILDI**; `billing/tenants` ve `payments` listeleri hâlâ tamamını döndürüyor (25+ işletmede sayfalayın): `GET /platform/tenants` ve `/platform/billing/tenants`, `/platform/payments` tüm kayıtları tek seferde döndürüyor
  (payments en fazla 500). 25+ işletmede yavaşlar; N+1 sorgular var (billing özeti işletme başına). Arama (ad/slug/sahip/telefon), durum filtresi, sıralama.
- [x] (2026-10-15) **Kurulum kontrol listesi YAPILDI** (liste rozeti + detay kartı): (işletme başına "hazır mı" rozeti): hizmet var mı · her berberin çalışma saati var mı · her berber en az bir hizmete bağlı mı · adres/logo dolu mu ·
  ilk randevu alındı mı. (Gerçek hayatta yaşandı: personelin saati/hizmeti olmayınca müşteri sitesinde görünmedi.)
- [x] (2026-10-15) Platformdan **sahip şifresi sıfırlama YAPILDI** (geçici şifre bir kez gösterilir, WhatsApp mesajı hazır). **(2026-10-15) Şifre özellikleri de YAPILDI:** panelde Hesabım (şifre değiştirme, tüm cihazlardan çıkış) ve giriş ekranında "Şifremi unuttum" (telefon → kod → yeni şifre). Destek modunda şifre değiştirme kapalı. **Canlıda çalışması WhatsApp bağlantısına bağlı.**
- [x] (2026-10-15) Sahip adı/telefonu düzeltme YAPILDI. **Kalan (P1): slug (adres) değiştirme** (eski adrese yönlendirme düşün).
- [x] (2026-10-15) İşletme notu + "son olaylar" kartı (son 10 denetim kaydı) YAPILDI. Eski satır: (açıldı/ödeme/hatırlatma/askı/şifre sıfırlandı olayları tek listede; denetim kaydından türetilebilir).
- [x] (2026-10-15) **"İşletme olarak gir" YAPILDI** (tam yetki varsayılan, "yalnızca görüntüle" seçeneği; 60 sn tek kullanımlık kod, 60 dk oturum, destek şeridi, denetim kaydı).
  **Bilinen sınırlar:** destek token'ı 60 dk dolmadan sunucuda iptal edilemez (yöneticiyi pasife almak ya da personel `token_version` artırmak gerekir); tam yetki modunda parola değiştirme uç noktaları da çalışır (denetim kaydı var); engellenen salt-görüntüleme yazması kayıt bırakmaz.
- [ ] **P1 Kayıt ol — kalanlar (2026-10-16):** (a) ~~Onayla/Reddet detay sayfasında yok~~ **YAPILDI** (`SignupReviewCard`; liste ve detayda diyalog kodu iki yerde duruyor, ortaklaştırılabilir).
  (b) Başvuru onaylanınca/reddedilince sahibe **otomatik mesaj gitmiyor** (şimdilik wa.me ile elle); onay/ret mesaj şablonu (`platform_settings`) + wa.me bağlantısı eklenmeli.
  (c) ~~İşletme panelinde kurulum rehberi yok~~ **YAPILDI (2026-10-16):** `GET /api/admin/setup` (yalnızca yönetici) + Genel Bakış'ta `SetupGuide` kartı (5 adım, hepsi bitince kaybolur). Kalan: rehberde 'müşteri sitenizin adresini paylaşın' adımı ve ilk randevu adımı yok.
- [ ] **P2 İşletmeyi arşivleme/silme:** soft delete + 30 gün geri alma; müşteri verisini dışa aktarma (CSV/JSON) — KVKK silme/taşıma talebi için.
- [ ] **P2 Yalnızca-okuma platform yöneticisi rolü** (takip elemanı için).
- [ ] **P2 Platform girişi için 2FA** (TOTP) — platform hesabı tüm dükkânlara hükmediyor.
- [ ] **P3 Tüm "platform yöneticisi" eylemlerinin dışarı bildirimi** (kritik eylemde e-posta).

### Aşama C — Gelir, deneme ve metrikler
- [x] (2026-10-15) **Deneme süresi akışı YAPILDI** (14 gün, ek süre yok, bitmeden `trial_template` ile "devam etmek istiyor musunuz?", bitince anında otomatik askı, geliri etkilemez, dönüşüm oranı).
  **Kalan (P2):** aynı işletmeye tekrar tekrar deneme başlatmayı engelleyen kural yok; "Deneme" filtre sekmesi yok (bitenler "Yaklaşan" altında); dönüşüm oranı yalnızca platform istatistiğinde.
- [x] (2026-10-15) **Gelir metrikleri YAPILDI** (Genel Bakış: MRR/ARR, ücretli/deneme sayısı, 12 aylık tahsilat grafiği, yenileme takvimi, dikkat/ayrılma riski, plan dağılımı, en çok kullanılan işletmeler). Kalan: kayıt kaybı yalnızca otomatik askıyı yakalar (elle pasife alma zaman damgası tutmuyor). Eski satır: MRR/ARR (dönem fiyatı ÷ ay sayısı, deneme hariç), plan dağılımı, bu ay tahsilat/beklenen, **yenileme takvimi** (önümüzdeki 30 gün),
  kaybedilen işletme, deneme→ücretli dönüşüm.
- [x] (2026-10-15) Kullanım metrikleri + ayrılma riski listesi YAPILDI (Genel Bakış). Eski satır: işletme başına aylık randevu, aktif müşteri, son aktivite; **30+ gündür randevusu olmayan işletme = ayrılma riski** listesi.
- [ ] **P2 Hatırlatma geçmişi:** hangi işletmeye ne zaman hatırlatıldı (şu an yalnızca `reminded_at` son zamanı tutuluyor).
- [ ] **P2 Ödeme düzeltme/iade kaydı:** şu an yalnızca ödeme silinebiliyor; fazla ödeme eksi bakiye olarak kalıyor (iade/düzeltme kavramı yok).
- [ ] **P3 Dönemler arası boşluk** uyarısı (şu an boşluk "kapsanıyor" sayılıyor).

### Aşama D — Sonrası
- [x] ~~Paket limitleri / özellik bayrakları~~ **KARAR: yapılmayacak** (tek paket, her özellik açık).
- [x] (2026-10-16) **WhatsApp ban / kötüye kullanım koruması YAPILDI** (`app/services/whatsapp_guard.py`, `whatsapp_queue.py`). İlke: hacmi değil kötüye kullanımı sınırla.
  - Doğrulama kodu (dışarıdan tetiklenebilen tek mesaj): IP başına saatte 10 / günde 30; dükkân başına saatte 300 / günde 2000 tavan (son çare);
    **doğrulanmayan kod alarmı** (son 1 saatte 3 dk'dan eski 25+ girilmemiş kod -> gönderim durur + platform bildirimi); WhatsApp'ı olmayan numaraya gönderilmez (Evolution `whatsappNumbers`, 24 sa önbellek);
    1-2 sn "yazıyor" beklemesi; metin 3 kalıptan dönüşümlü; mesajda link yok.
  - Sistem mesajları (onay/iptal/hatırlatma/personel): **sınırsız, kuyrukta** (`outbound_messages`), aynı numaradan 3-8 sn rastgele aralık, 1,5-3,5 sn "yazıyor", hatırlatmalar 22:00-08:30 arası bekler, 3 denemede üstel geri çekilme, bağlantı yoksa 24 sa bekler sonra iptal, gönderilince telefon/metin silinir. Çok worker'da güvenli (SKIP LOCKED).
  - Hat sağlığı: arka arkaya 5 hatada otomatik durdurma (yeniden bağlanınca kalkar); kopma/ban tespiti (webhook `statusReason` 401/403 + 5 dk'da bir sağlık kontrolü) -> sahip panelinde kapatılamaz kırmızı şerit + platforma push/e-posta; platformda dükkân başına "Gönderimi durdur" anahtarı (denetim kaydı); Sistem sayfasında kuyruk ve uyarı listesi; 90 günden eski mesaj kayıtları silinir.
  - **Kalan:** onay/iptal/hatırlatma mesajlarının kendisi henüz üretilmiyor (kuyruk hazır, `whatsapp_queue.enqueue` ile bağlanacak — bkz. §3 randevu hatırlatma); CAPTCHA yok (gerekirse Cloudflare Turnstile); süreç içi önbellek ve "yazıyor" aralığı worker başına; resmi WhatsApp Cloud API'ye geçiş seçeneği değerlendirilmedi.
- [x] (2026-10-16) **WhatsApp durum paneli + işletme başına saatlik hız sınırı YAPILDI** (`message_logs`, `WHATSAPP_TENANT_HOURLY_LIMIT`=60, Sistem sayfasında bağlantı durumu/24 sa sayıları/en çok gönderen 5 işletme). **Kalan:** Evolution `connectionState` yanıt biçimi canlıda doğrulanmadı (tahmin); `message_logs` temizliği (eski kayıtlar silinmiyor); yalnızca OTP/şifre sıfırlama kayıtlı (ileride hatırlatma mesajları da).
- [x] (2026-10-16) **Duyuru YAPILDI** (`/platform/duyurular`; tümü/seçili işletme, başlangıç-bitiş tarihi, bilgi/uyarı; işletme panelinde kapatılabilir banner, kapatma tarayıcıda hatırlanır). WhatsApp ile gönderim bilerek YOK.
- [ ] **P2 Makbuz/fatura:** şimdilik PDF makbuz; resmileşince e-fatura entegrasyonu (GİB özel entegratör / Paraşüt vb.) ve online ödeme (iyzico/PayTR).
- [x] (2026-10-16) **İndirim YAPILDI** (kod sistemi yok; dönem eklerken/yenilerken/düzenlerken elle yüzde; `subscriptions.list_price/discount_percent`, ödenecek tutar = liste − indirim). Kalan: ödemeler sayfasında indirim gösterimi yok.
- **KARAR: özel alan adı ve çoklu şube yapılmayacak.**

---

## 3. Dükkân paneli (işletme sahibi / personel)

- [ ] **P1 Randevu fiyat anlık görüntüsü:** randevu kaydı fiyatı SAKLAMIYOR; gelir raporu hizmetin **şu anki** fiyatını kullanıyor → hizmet fiyatı değişirse geçmiş gelir de değişir.
  Çözüm: tamamlanırken `appointments.price` yaz (migration + geçmiş kayıtlar için mevcut fiyatla doldurma).
- [ ] **P1 Gider takibi / net kâr:** "net gelir" şu an sadece tamamlanan randevu geliri (iptal/gelmedi/bekleyen hariç). Kira/malzeme/maaş gibi giderler yok.
- [ ] **P1 Randevu hatırlatma mesajı** (müşteriye 1 gün/1 saat önce, WhatsApp) — `appointments.reminder_sent` sütunu var ama **hiçbir kodda kullanılmıyor**. İptal/onay bildirimi de yok.
- [ ] **P2 Haftalık tablo görünümü**, randevuyu **sürükle-bırak ile taşıma**, çoklu gün izin, resmi tatil günleri.
- [ ] **P2 Berbere özel fiyat:** `staff_services.price` sütunu var, kullanılmıyor (usta berber daha pahalı vb.).
- [ ] **P2 Hizmet kategorileri**, toplu içe aktarma (CSV: müşteri/randevu), müşteri notu/etiketi, müşteri bazında no-show sayacı.
- [ ] **P2 Dükkân sahibi için denetim kaydı** (personel ne yaptı: randevu iptali, fiyat değişimi). Şu an yalnızca platform tarafında var.
- [ ] **P3** Personelin kendi çalışma saati/izin *talebi* (düzenleyemez, talep edebilir), çok dilli arayüz (şu an yalnızca Türkçe).
- [x] (2026-10-16) **Açık/koyu tema YAPILDI:** varsayılan AÇIK, koyu tema güneş/ay düğmesiyle (panel kenar çubuğu, giriş sayfaları, müşteri ve tanıtım sitesi başlıkları). Renkler `src/index.css` tokenlarından; koyu değerler `:root[data-theme="dark"]`; tercih tarayıcıda (`localStorage.theme`), backend'e gitmez; `index.html`'de yanıp sönmeyi önleyen erken script. Yeni renk eklerken sabit hex YAZMAYIN, token kullanın (bakır zemin üstü metin: `text-on-accent`). Kalan: tercih cihazlar arası senkron değil; sistem temasını (prefers-color-scheme) izleme yok; PWA manifest `theme_color` sabit açık.
- [ ] **Not:** Müşteri listesi personelde yalnızca kendi müşterileriyle sınırlı → yeni randevu formunda başka berberin müşterisinin adı otomatik dolmaz (telefon yine eşleşir). Gerekirse yeniden değerlendirin.

## 4. Müşteri tarafı

- [ ] **P0 OTP'nin WhatsApp'tan gitmesi** (bkz. `CANLIYA_ALMA.md` §0).
- [ ] **P1 "Fark etmez, herhangi bir berber" seçeneği** yok (kullanılabilirlik için en müsait berberi otomatik seçme).
- [ ] **P1 Müşteri randevu değiştirme (erteleme):** şimdi yalnızca iptal (2 saat kuralı) var.
- [ ] **P2 Randevu sonrası bildirim** (onay mesajı WhatsApp'a), takvime ekle (.ics).
- [ ] **P2 Dükkân sitesi görselleri:** kapak/logo yüklenmemiş dükkânda marka adlı tipografik kapak çıkıyor; galeri/çalışma saatleri/harita bölümü yok.
- [ ] **P3 Müşteri değerlendirme/yorum:** bilinçli olarak kapsam dışı (ürün ucuz paket; ileride üst pakette düşünülebilir).

## 5. Güvenlik

- [ ] **P0** Canlı parolalar/sırlar, `ENVIRONMENT=production`, `/docs` kapatma, `TRUST_PROXY_HEADERS` (bkz. `CANLIYA_ALMA.md` §1, §3).
- [x] (2026-10-15) Personel/sahip "şifremi unuttum" ve panelde şifre değiştirme YAPILDI. Not: sahibin Ekip sayfasından belirlediği şifre hâlâ min 6 karakter; kullanıcının kendi seçtiği yeni şifre min 8 + telefona eşit değil + yaygın değil.
- [ ] **P1 Oturum süresi/yenileme:** token ömrü tek sabit (`ACCESS_TOKEN_EXPIRE_MINUTES`), refresh token yok; müşteri oturumu 30 dk. Süre dolunca kullanıcı girişe atılıyor — kullanıcı deneyimi gözden geçirilmeli.
- [ ] **P1 Giriş sınırı atomik değil:** paralel tahmin denemeleri limiti hafifçe aşabilir; olmayan telefonda bcrypt atlandığı için yanıt süresi farkı kullanıcı varlığını sızdırabilir (sahte hash ile eşitleyin).
  Başarılı girişte o anahtarın başarısız kayıtları silindiği için IP sayacı da düşer.
- [ ] **P1 OTP temizliği:** `verification_codes` tablosunda süresi dolan kodlar silinmiyor (tablo büyür). Günlük görevle temizleyin. `login_attempts` yalnızca yeni deneme yazarken 24 saatten eski satırları siliyor.
- [ ] **P2 `audit_logs` büyümesi:** saklama/arşiv politikası yok. Kayıtlar silinemez olmalı ama yıllar içinde büyür (bölümleme/arşiv).
- [ ] **P2 İçerik güvenlik politikası (CSP)** ve diğer güvenlik başlıkları (frontend tarafı/Nginx).
- [ ] **P2 Son aktif platform yöneticisini silme/pasife alma koruması** API'den test edilemiyor (çağıran zaten aktif ve farklı olmak zorunda); servis fonksiyonu için birim testi ekleyin.
- [ ] **P2 Bağımlılık taraması** (pip-audit, npm audit) ve düzenli güncelleme.
- [ ] **P3** WhatsApp hattının **ban riski** (resmi olmayan API): platform hattı için ayrı numara, mesaj hız sınırı, ileride resmi WhatsApp Business API'ye geçiş seçeneği.

## 6. Teknik borç ve altyapı

- [ ] **P0 Migration baseline:** ilk migration `schema.sql`'e bağımlı (boş DB'de `alembic upgrade head` çalışmıyor; `backend/tests/test_zz_migrations.py` içinde `xfail` olarak belgeli).
  Çözüm: mevcut modellerden tek bir baseline migration üretip zinciri sıfırlamak ya da ilk migration'ı tablo oluşturacak şekilde yeniden yazmak.
- [ ] **P1 CI:** GitHub Actions ile her push'ta `bash backend/scripts/run_tests.sh` + `npx tsc -b` + `npm run build`. (Şu an testler yalnızca elle koşuyor; 223 test + 1 xfail, ~37 sn.)
- [ ] **P1 `requirements.txt` sürümleri sabit değil** (fastapi, uvicorn… sürümsüz). `pip freeze` ile sabitleyin; Python 3.14 uyumu için bağımlılık kontrolü.
- [ ] **P1 Görseller veritabanında** (logo/kapak/personel fotoğrafı data URL, ≤ 1,5 MB): herkese açık `/api/staff` her sayfa açılışında tüm personel fotoğraflarını gönderiyor → çok dükkân/personelde yavaşlar.
  Çözüm: dosya depolama (disk/S3) + CDN, tarayıcı önbelleği, veritabanında yalnızca yol.
- [ ] **P1 Saat dilimi:** backend saat dilimsiz `datetime.now()`/`date.today()` kullanıyor (31 yer). Sunucu `Europe/Istanbul` olmalı (bkz. canlıya alma) ya da kodu saat dilimine duyarlı hale getirin.
- [ ] **P2 Kullanılmayan tablo/sütunlar:** `webhook_cooldown` tablosu, `appointments.reminder_sent`, `staff_services.price`, `AppointmentStatus.PENDING` — kullanılacaksa bağlayın, değilse kaldırın.
- [ ] **P2 `schema.sql` ile modeller/migration'lar ayrışabilir** (tek doğruluk kaynağı: modeller + alembic). `schema.sql`'i güncelleyin ya da kaldırın.
- [ ] **P2 Frontend lint uyarıları** (oxlint/React Compiler): `Date.now()`/`new Date()` render sırasında, effect içinde `setState` — BookingPage, MyAppointmentsPage, PublicLayout, AppointmentsPage `useMemo` bağımlılıkları.
- [ ] **P2 Geliştirme notu:** yeni bir dosyaya Tailwind sınıfı eklenince Vite geliştirme sunucusu bazen CSS'i görmez → Vite'ı yeniden başlatın (üretim derlemesinde sorun yok).
- [ ] **P2 Hata izleme/log toplama** (Sentry vb.), uptime izleme.
- [ ] **P2 Performans:** ilk yükleme paket boyutu (frontend ~320 kB + sayfa başına parça), `useQueries` ile personel başına çalışma saati/izin sorguları (tablo görünümü) — çok personelde toplu uç nokta düşünün.
- [ ] **P3** `scripts/seed_demo.py` korumasız (bkz. canlıya alma §4); test ve seed scriptlerinin tek `scripts/dev/` klasöründe toplanması.

## 7. Yasal / ticari

- [x] (2026-10-16) KVKK metinleri TASLAK olarak YAZILDI (`frontend/src/lib/legal.ts`: aydınlatma, gizlilik, kullanım şartları, veri işleme sözleşmesi; `/yasal/<slug>`). Müşteri OTP adımında aydınlatma onay kutusu, kayıt formunda şart onayı; onaylar `consent_records` tablosunda (sürümlü).
- [ ] **P0 Şirket bilgileri boş:** `legal.ts` içindeki `COMPANY` (ünvan, vergi no, adres, e-posta, KVKK e-postası, telefon) doldurulmalı — kullanıcının şirketi henüz yok. Metin değişirse `LEGAL_VERSIONS` (frontend) ve `backend/app/core/legal.py` sürümleri birlikte artırılmalı.
- [ ] **P0 Hukuki inceleme:** metinler avukat onayından geçmedi; canlıdan önce incelettirin (özellikle yurt dışı aktarım/WhatsApp ve saklama süreleri).
- [ ] **P1** Fiyatlandırma/paket sayfası tanıtım sitesinde yok (SSS "Fiyat nedir?" → "iletişime geçin"). Karar: açık fiyat mı, "teklif al" mı?
- [ ] **P1** Tanıtım sitesi iletişim bilgileri (WhatsApp numarası, e-posta) **boş** (`content.ts`).
- [ ] **P2** Şirket bilgileri (unvan, vergi no, adres) footer ve fatura için.

## 8. Bilinen davranışlar (hata değil, bilinçli)

- Telefon `(telefon, tenant_id)` ile benzersiz: aynı telefon farklı dükkânlarda olabilir; aynı kişi iki dükkânın sahibiyse iki ayrı hesap/parola (tek girişle geçiş yok). Platform yöneticisi telefonu küresel benzersiz.
- Sayfa adresi yerelde `<slug>.localhost:5173` (Chrome/Edge/Firefox; Safari `*.localhost` çözmez); düz `localhost:5173` demo dükkânına gider.
- Geliştirmede sabit OTP `123456` (`OTP_FIXED_CODE`, yalnızca `ENVIRONMENT=development`).
- Dönemi olmayan işletme "takip dışı": asla bildirim/askıya alma olmaz.
- Yeni işletme kendiliğinden hizmet/çalışma saati içermez (panelden girilmeli).
- Platform `Sistem` sayfasında WhatsApp "Erişilemiyor" = Evolution henüz bağlı/erişilebilir değil.

## 9. Son turda eklenen/bulunan notlar (2026-10-15)

- [x] **Personel "işten ayrıldı" (pasife alma) YAPILDI:** pasif personel giriş yapamaz, müşteri sitesinde/slotlarda görünmez, geçmiş randevu + gelir kayıtları ve gelir raporundaki personel dağılımı korunur;
  gelecek randevusu olan personel pasife alınamaz (409); silme, randevusu olan personelde hâlâ engelli. Veritabanında `appointments.staff_id` artık `ON DELETE NO ACTION` (eskiden CASCADE'di: personel satırı SQL ile silinirse randevuları/geliri de silinirdi).
- [ ] **P1 (2026-10-16 güncellendi) Dükkân başına WhatsApp YAZILDI ve yerel Evolution v2.3.7'ye karşı doğrulandı:** instance oluşturma, QR, eşleştirme kodu, connectionState, fetchInstances alanları, logout, webhook kurulumu ve container→backend erişimi gerçek API ile denendi. **Henüz denenmeyen:** gerçek telefonla okutup `open` olması, CONNECTION_UPDATE webhook gövdesi, gerçek `sendText` teslimi. Eski not: WhatsApp teslimat kodu yazıldı ama CANLI Evolution'a karşı HİÇ denenmedi. `whatsapp_services.send_whatsapp_message` aynı yükte hem v1 (`textMessage.text`) hem v2 (`text`) biçimini gönderiyor (tahmin); numara `90…` (+ olmadan) gidiyor.
  Üretimde Evolution bağlanana kadar müşteri `send-code` ve "şifremi unuttum" **503 verir**. QR okutulunca gerçek mesajla doğrulayın; gerekirse yük biçimini düzeltin.
  Küçük sızıntı: Evolution kapalıyken "şifremi unuttum" 503'ü numaranın kayıtlı olduğunu ele verir (yalnızca kayıtlı numaraya gönderim denendiği için).
- [ ] **P2** Churn tespiti yalnızca otomatik askıyı görür (elle pasife alma zaman damgası yok). `trial_conversion_rate` oranı 0..1; arayüz yüzde gösterir.
- [ ] **P2** "Son aktif yönetici" koruması fiilen ulaşılamaz (çağıran zaten aktif yönetici); yalnızca "kendini pasife alamaz" test edilebiliyor.
- [ ] **P3** Şifre kuralı tutarsızlığı: sahibin atadığı personel şifresi min 6; kullanıcının kendi seçtiği min 8. İsterseniz tek kurala indirin.
