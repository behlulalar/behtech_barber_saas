# İşletme Müşteri Sayfaları — Yapılacaklar ve Kararlar

Beyin fırtınası: 2026-10-17. Kapsam: müşterinin gördüğü işletme sitesi (`<slug>.berberpanelim...`): ana sayfa (`LandingPage`), 4 adımlı
randevu akışı (`BookingPage`: Hizmet, Berber, Zaman, Bilgiler + telefon doğrulama), `Randevularım`, yasal sayfalar.
Ölçüt: kafa karıştırmadan, en az dokunuşla randevu almak (kitle her yaştan). Diğer listeler: `GENEL_SITE_YAPILACAKLAR.md`,
`ISLETME_PANELI_YAPILACAKLAR.md`, `PLATFORMA_EKLENECEKLER.md`, `EKSIKLER.md`.

## Kullanıcı fikri (öncelikli)
- [x] (2026-10-17 YAPILDI) **Hizmetler "kutu kutu" kartlar, görselli (portfolyo hissi).** Hizmetler formunda "Fotoğraf (isteğe bağlı)" (900px JPEG, ~300 KB sınırı, backend 400 bin karakter), ana sayfada 3 sütunlu kart ızgarası, randevu "Hizmet" adımında küçük görsel; fotoğrafsızsa hizmetin baş harfli çizgili yedek kapak. Ana sayfadaki hizmet kartına tıklayınca o hizmet seçili olarak doğrudan "Berber" adımı açılır (`/randevu?hizmet=ID`, YAPILDI). Müşteri "bu adam nasıl kesim yapıyor" sorusunu görerek yanıtlasın.
      - Hizmet başına isteğe bağlı fotoğraf (işletme panelinde Hizmetler'den yüklenir, ImagePicker + istemci tarafı küçültme).
      - Fotoğraf yoksa da güzel görünen bir yedek tasarım (hizmet adından/simgesinden üretilen tipografik/desenli kapak; zaten
        işletme kapağı için benzeri var). Fotoğraflı ve fotoğrafsız kartlar bir arada yan yana uyumlu durmalı.
      - Kart: görsel, ad, süre, fiyat; randevu akışının "Hizmet" adımında da aynı kart dili.
      - Teknik not: görseller DB'de data URL olarak tutuluyor (bilinen sınır, bkz. EKSIKLER.md). Liste API'sini şişirmemek için
        istemcide küçültme (kısa kenar ~800 px, JPEG/WebP) ve boyut sınırı şart.

- [x] (2026-10-17 YAPILDI) **Randevu "Bilgiler" adımı:** numara üstte, ad-soyad altta. Bu cihazda daha önce randevu alınmış numara tam yazılınca ad-soyad otomatik dolar
      (`lib/knownContacts.ts`, son 5 numara, yalnızca tarayıcıda). Sunucudan ad GETİRİLMEZ (doğrulanmamış numaradan ad sızdırmamak için, KVKK); başka numara yazılınca
      otomatik dolan ad temizlenir. Numara sistemde kayıtlıysa ve yazılan ad farklıysa doğrulama sonrası "bu numara X adına kayıtlı; randevu bu adla oluşturuldu" uyarısı çıkar.
      Not: kayıtlı müşterinin adı hâlâ ilk kayıttaki addır (randevuya özel ad saklanmıyor; baba/oğul durumu kritik görülmedi).

- [x] (2026-10-17 YAPILDI) **Saat çakışması / canlı gölgeleme:** randevu alma ve saat değiştirme aynı berberin kaydını kilitler (testli: biri alırken biri değiştirirse tek kazanan, diğeri 409).
      Saat seçim ekranı ve "Saati değiştir" penceresi 15 sn'de bir ve sekmeye dönünce yenilenir; başkası saati alırsa "Dolu" görünür, seçili saat dolduysa seçim kalkar + uyarı.
      Bilerek YAPILMADI: "başkası şu an seçiyor" geçici rezervasyon (kötüye kullanımla tüm saatler kilitlenebilir, karmaşık).

## Önerilenler (kullanıcı "güzel eklenebilir" dedi)
1. [x] (2026-10-17 YAPILDI; randevu sonrası ekranda ve Randevularım'da yaklaşan randevu kartlarında; tarayıcıda görsel doğrulama yapılmadı) **Randevu sonrası "takvime ekle" (.ics) + "yol tarifi"** (onay ekranında; haritalar bağlantısı şu an yalnızca ana sayfada).
2. [x] (2026-10-17 YAPILDI; 2+ berber varsa "Berber" adımının başında; birleşik saatler + sunucu o gün en az randevusu olanı atar, eşitlikte küçük id; eşzamanlı isteklerde berber satırları id sırasıyla kilitlenir) **"Fark etmez, herhangi bir berber" seçeneği** (birden fazla berberi olan dükkânlarda; boş saatleri birleştirir).
3. [x] (2026-10-17 YAPILDI; Randevularım'da "Saati değiştir"; aynı hizmet + berber, iptal kuralıyla aynı 2 saat sınırı, eski bekleyen WhatsApp mesajları iptal edilip müşteriye/berbere "güncellendi" mesajı gider; kalan: kendi saatiyle örtüşen kaydırma arayüzde "Dolu" görünür, API izin verir) **Randevuyu değiştirme:** "Başka saate al" (aynı hizmet ve berber; yalnızca yeni saat seçtirir). Şu an yalnızca iptal var.
4. [x] (2026-10-17 YAPILDI; kod ve testler tamam, GERÇEK WhatsApp ile henüz denenmedi) **WhatsApp'tan iptal:** `cancel_by_message.py`; onay mesajının sonunda "iptal yazarak yanıtlayın" notu var; tek yaklaşan randevu iptal edilir (2 saat kuralı), birden çok randevu/@lid/geç kalma durumunda siteye yönlendirilir; "iptal etmeyin" gibi olumsuzlar ve uzun cümleler yok sayılır. hatırlatmaya "iptal" yazan müşterinin randevusu iptal olsun; berbere bildirim (bkz. EKSIKLER.md).
5. [ ] **Hizmet süresi + çalışma saatleri / "şu an açık-kapalı"** ana sayfada görünür mü kontrol edilip eksikse eklenir.

## YÜKSEK ÖNCELİK (altyapı)
- [ ] **Görsel depolama** (görseller DB'den dosyaya): ayrıntı ve gerekçe `EKSIKLER.md` P1 maddesinde. Hizmet görselleri bu yüzden küçük sınırla (400 bin karakter) tutuluyor.

## Bilerek yapılmayacaklar
Müşteri hesabı/şifre, puan ve yorum (kapsam dışı), online ödeme, kampanya/kupon. Ayrı foto galeri sayfası da YOK: portfolyo
hissi hizmet kartlarındaki görsellerle verilir (görseller DB'de, "az ve öz").

## Sıra
Önce hizmet kartları (kullanıcı fikri) -> takvime ekle + yol tarifi -> herhangi bir berber -> randevuyu değiştirme -> WhatsApp iptal.
Gerçek kullanıcı gözlemi (nerede takıldılar?) geldikçe bu liste güncellenir.
