# İşletme (Admin) Paneli — Yapılacaklar ve Kararlar

Beyin fırtınası: 2026-10-17. İşletme panelinin ana ilkesi (kullanıcı kararı): **az ve öz.** Hedef kitle berber/kuaför; teknolojiyle iç içe
olmayan insanlar. Bu yüzden: yeni menü öğesi eklenmez; mevcut ekrana en fazla bir düğme/kart eklenir ya da iş arka planda otomatik olur;
berberin ayar yapması gerekmez. Genel eksikler: `EKSIKLER.md`. Platform paneli listesi: `PLATFORMA_EKLENECEKLER.md`.

## YAPILACAKLAR (onaylandı)

- [x] (2026-10-17 YAPILDI) **Menü sadeleştirme.** Uygulanan: üstte Genel Bakış/Randevular/Müşteriler/Gelir Raporu/Bildirimler; "İŞLETME" başlığı altında Hizmetler/Ekip/Çalışma Saatleri/WhatsApp/Ayarlar; "HESAP" altında Hesabım. Ödeme Yöntemleri menüden çıktı, Ayarlar sayfasının sağ üstündeki "Ödeme yöntemleri" düğmesinden açılır (adres aynı). Eski öneri metni: Sahibin menüsünde 12 öğe var. Öneri (uygulanmadan önce kısa bir onay alınabilir):
      - Günlük işler üstte: Genel Bakış, Randevular, Müşteriler.
      - Bir kez kurulup bırakılanlar "İşletmem" başlığı altında: Hizmetler, Ekip, Çalışma Saatleri, WhatsApp, Ayarlar (Ödeme Yöntemleri Ayarlar'a taşınır).
      - Gelir Raporu, Bildirimler (okunmamış rozetiyle), Hesabım yerinde/uygun grupta kalır.
      - Berber (staff) menüsü zaten kısa (3 öğe); korunur.
      - Mobil alt çubuk (en fazla 4 sekme) ve Menü çekmecesi aynı gruplamayı izlemeli.
- [x] (2026-10-17 YAPILDI; yazdırma çıktısı gerçek yazıcıda denenmedi) **Randevu linkini paylaşma + basılabilir QR.** Genel Bakış'ta "Randevu adresiniz" kartı: Kopyala, WhatsApp ile paylaş, "QR kod ve afiş" (SVG indir + A4 afiş yazdır; yalnızca yönetici). QR ana sayfaya gider. Kalan: kurulum rehberine "adresi paylaşın" adımı eklenmedi; tasarımlı PVC afiş ayrı grafik iş. Eski öneri metni: Genel Bakış'ta tek kart: adres, "Kopyala", "WhatsApp ile paylaş", "QR kodu indir/yazdır".
      - QR vektör (SVG) ve yüksek hata düzeltmeli olmalı: vitrine PVC afiş olarak basılacak (kullanıcı fikri: anlaşmalı berberlere
        güzel tasarlanmış PVC kaplı afiş + QR verilmesi). Baskıda bozulmaması için sabit/kısa adres (işletme alt alanı) kullanılır.
      - Afiş: işletme adı + QR + "Randevu için okutun" içeren yazdırmaya hazır bir sayfa/PDF (A4/A5). Tasarım ayrı (grafik) iş; kodda
        yalnızca QR + metin yerleşimi üretilir. İleride platform panelinden işletme başına afiş PDF'i indirme düşünülebilir.
      - Kurulum rehberindeki eksik "müşteri sitenizin adresini paylaşın" adımı da bu kartla kapanır (bkz. EKSIKLER.md).
- [x] (2026-10-17 YAPILDI) **"Bugün kapalıyım" tek tuşu (Genel Bakış).** Hizmet veren tüm personele o gün tüm gün izin açılır (işaret: izin nedeni "İşletme kapalı"); "Tekrar aç" yalnızca bunları siler, personelin kendi izinlerine dokunmaz; randevular iptal edilmez, sayı uyarıda gösterilir. Kalan: kapatınca randevusu olan müşterilere otomatik mesaj gitmiyor; "yarın da kapalıyım" yok. Eski öneri metni: Aniden kapanma günleri için: bugünü tek dokunuşla kapatır (mevcut "izin" altyapısı,
      tüm gün). Bugün için onaylı randevu varsa önce uyarı gösterilir (sayısıyla); randevular otomatik İPTAL EDİLMEZ (izin
      çakışma uyarısı mantığıyla aynı). Geri almak için aynı yerde "Tekrar aç". İsteğe bağlı: "yarın da kapalıyım".

## REDDEDİLDİ (yapılmayacak — nedenleriyle)

- **Sabah özeti WhatsApp mesajı:** mesajı gönderen numara işletmenin KENDİ numarası olduğundan mesaj kişinin kendisine yazılmış olur,
  gözden kaçar; değer üretmez. (Platform numarasından göndermek de seçeneğimiz değil: her dükkân kendi hattını kullanır.)
- **Müşteri notu:** gerek görülmedi.
- **Gelmeyen müşteri sayacı:** gerek görülmedi.
- **Bilerek önerilmeyenler (karmaşıklık / ban riski):** stok, kasa/prim, sadakat puanı, kampanya ve toplu mesaj (WhatsApp ban riski),
  çoklu şube, ayrıntılı bildirim ayarları.

## Sonraya / gözden geçirilecek

- Sayfa sayfa sadeleştirme turu (ör. Ayarlar'da gereksiz alanlar) — ayrıca ele alınacak.
- [x] (2026-10-17 ÇÖZÜLDÜ) Randevu fiyatı artık randevu anında `appointments.price` olarak saklanır; hizmet fiyatı değişince geçmiş rapor/ciro değişmez. Eski kayıtlar migration'da hizmetin o günkü (güncel) fiyatıyla dolduruldu; NULL kalan satır olursa raporlar hizmetin güncel fiyatına düşer.
