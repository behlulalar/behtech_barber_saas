# İşletme Müşteri Sayfaları — Yapılacaklar ve Kararlar

Beyin fırtınası: 2026-10-17. Kapsam: müşterinin gördüğü işletme sitesi (`<slug>.berberpanelim...`): ana sayfa (`LandingPage`), 4 adımlı
randevu akışı (`BookingPage`: Hizmet, Berber, Zaman, Bilgiler + telefon doğrulama), `Randevularım`, yasal sayfalar.
Ölçüt: kafa karıştırmadan, en az dokunuşla randevu almak (kitle her yaştan). Diğer listeler: `GENEL_SITE_YAPILACAKLAR.md`,
`ISLETME_PANELI_YAPILACAKLAR.md`, `PLATFORMA_EKLENECEKLER.md`, `EKSIKLER.md`.

## Kullanıcı fikri (öncelikli)
- [x] (2026-10-17 YAPILDI) **Hizmetler "kutu kutu" kartlar, görselli (portfolyo hissi).** Hizmetler formunda "Fotoğraf (isteğe bağlı)" (900px JPEG, ~300 KB sınırı, backend 400 bin karakter), ana sayfada 3 sütunlu kart ızgarası, randevu "Hizmet" adımında küçük görsel; fotoğrafsızsa hizmetin baş harfli çizgili yedek kapak. Kalan: kartlara tıklayınca o hizmetle randevu akışı başlatma. Müşteri "bu adam nasıl kesim yapıyor" sorusunu görerek yanıtlasın.
      - Hizmet başına isteğe bağlı fotoğraf (işletme panelinde Hizmetler'den yüklenir, ImagePicker + istemci tarafı küçültme).
      - Fotoğraf yoksa da güzel görünen bir yedek tasarım (hizmet adından/simgesinden üretilen tipografik/desenli kapak; zaten
        işletme kapağı için benzeri var). Fotoğraflı ve fotoğrafsız kartlar bir arada yan yana uyumlu durmalı.
      - Kart: görsel, ad, süre, fiyat; randevu akışının "Hizmet" adımında da aynı kart dili.
      - Teknik not: görseller DB'de data URL olarak tutuluyor (bilinen sınır, bkz. EKSIKLER.md). Liste API'sini şişirmemek için
        istemcide küçültme (kısa kenar ~800 px, JPEG/WebP) ve boyut sınırı şart.

## Önerilenler (kullanıcı "güzel eklenebilir" dedi)
1. [ ] **Randevu sonrası "takvime ekle" (.ics) + "yol tarifi"** (onay ekranında; haritalar bağlantısı şu an yalnızca ana sayfada).
2. [ ] **"Fark etmez, herhangi bir berber" seçeneği** (birden fazla berberi olan dükkânlarda; boş saatleri birleştirir).
3. [ ] **Randevuyu değiştirme:** "Başka saate al" (aynı hizmet ve berber; yalnızca yeni saat seçtirir). Şu an yalnızca iptal var.
4. [ ] **WhatsApp'tan iptal:** hatırlatmaya "iptal" yazan müşterinin randevusu iptal olsun; berbere bildirim (bkz. EKSIKLER.md).
5. [ ] **Hizmet süresi + çalışma saatleri / "şu an açık-kapalı"** ana sayfada görünür mü kontrol edilip eksikse eklenir.

## YÜKSEK ÖNCELİK (altyapı)
- [ ] **Görsel depolama** (görseller DB'den dosyaya): ayrıntı ve gerekçe `EKSIKLER.md` P1 maddesinde. Hizmet görselleri bu yüzden küçük sınırla (400 bin karakter) tutuluyor.

## Bilerek yapılmayacaklar
Müşteri hesabı/şifre, puan ve yorum (kapsam dışı), online ödeme, kampanya/kupon. Ayrı foto galeri sayfası da YOK: portfolyo
hissi hizmet kartlarındaki görsellerle verilir (görseller DB'de, "az ve öz").

## Sıra
Önce hizmet kartları (kullanıcı fikri) -> takvime ekle + yol tarifi -> herhangi bir berber -> randevuyu değiştirme -> WhatsApp iptal.
Gerçek kullanıcı gözlemi (nerede takıldılar?) geldikçe bu liste güncellenir.
