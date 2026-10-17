# İşletme (Admin) Paneli — Yapılacaklar ve Kararlar

Beyin fırtınası: 2026-10-17. İşletme panelinin ana ilkesi (kullanıcı kararı): **az ve öz.** Hedef kitle berber/kuaför; teknolojiyle iç içe
olmayan insanlar. Bu yüzden: yeni menü öğesi eklenmez; mevcut ekrana en fazla bir düğme/kart eklenir ya da iş arka planda otomatik olur;
berberin ayar yapması gerekmez. Genel eksikler: `EKSIKLER.md`. Platform paneli listesi: `PLATFORMA_EKLENECEKLER.md`.

## YAPILACAKLAR (onaylandı)

- [ ] **Menü sadeleştirme.** Sahibin menüsünde 12 öğe var. Öneri (uygulanmadan önce kısa bir onay alınabilir):
      - Günlük işler üstte: Genel Bakış, Randevular, Müşteriler.
      - Bir kez kurulup bırakılanlar "İşletmem" başlığı altında: Hizmetler, Ekip, Çalışma Saatleri, WhatsApp, Ayarlar (Ödeme Yöntemleri Ayarlar'a taşınır).
      - Gelir Raporu, Bildirimler (okunmamış rozetiyle), Hesabım yerinde/uygun grupta kalır.
      - Berber (staff) menüsü zaten kısa (3 öğe); korunur.
      - Mobil alt çubuk (en fazla 4 sekme) ve Menü çekmecesi aynı gruplamayı izlemeli.
- [ ] **Randevu linkini paylaşma + basılabilir QR.** Genel Bakış'ta tek kart: adres, "Kopyala", "WhatsApp ile paylaş", "QR kodu indir/yazdır".
      - QR vektör (SVG) ve yüksek hata düzeltmeli olmalı: vitrine PVC afiş olarak basılacak (kullanıcı fikri: anlaşmalı berberlere
        güzel tasarlanmış PVC kaplı afiş + QR verilmesi). Baskıda bozulmaması için sabit/kısa adres (işletme alt alanı) kullanılır.
      - Afiş: işletme adı + QR + "Randevu için okutun" içeren yazdırmaya hazır bir sayfa/PDF (A4/A5). Tasarım ayrı (grafik) iş; kodda
        yalnızca QR + metin yerleşimi üretilir. İleride platform panelinden işletme başına afiş PDF'i indirme düşünülebilir.
      - Kurulum rehberindeki eksik "müşteri sitenizin adresini paylaşın" adımı da bu kartla kapanır (bkz. EKSIKLER.md).
- [ ] **"Bugün kapalıyım" tek tuşu (Genel Bakış).** Aniden kapanma günleri için: bugünü tek dokunuşla kapatır (mevcut "izin" altyapısı,
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
- Teknik not: randevuda fiyat saklanmıyor (gelir raporu hizmet fiyatı değişince geçmişi de değiştirir) — bkz. EKSIKLER.md.
