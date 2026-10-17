# Genel Site (Tanıtım Sayfası) — Yapılacaklar ve Kararlar

Beyin fırtınası: 2026-10-17. Kapsam: tanıtım sitesi (`berberpanelim.behlulalar.online`, `frontend/src/pages/product/`) ve kayıt sayfası.
Mevcut yapı: hero (dönen "Berberler için / Kuaförler için"), önce-sonra, özellikler, nasıl çalışır, cep (uygulama gibi kurulum), SSS,
başlayın, iletişim, alt bilgi. İlke: sayfa zaten uzun; kullanıcı tercihi **kısa ve öz** — yeni içerik eklerken bir bölüm kısaltılarak denge kurulur.
Diğer listeler: `PLATFORMA_EKLENECEKLER.md`, `ISLETME_PANELI_YAPILACAKLAR.md`, `EKSIKLER.md`.

## KARAR: Fiyat şimdilik YAZILMAYACAK
Henüz resmi bir şahıs/şirket yapısı yok; sayfada somut fiyat vermek yasal sorun doğurabilir. Bu yüzden "ilk 14 gün ücretsiz, sonrası görüşelim"
modeli korunur (SSS'deki "Fiyat nedir?" cevabı bu haliyle kalır).
- İleride bir arkadaşın şahıs şirketi üzerinden ödeme almak düşünülüyor; o zaman fiyat yazısı + fatura/makbuz akışı yeniden ele alınacak.
- NOT (yasal/mali): başkasının şirketi üzerinden tahsilat yapmanın vergi ve sorumluluk sonuçları olabilir (gelir kimin adına yazılır,
  fatura, KDV, KVKK "veri sorumlusu" kim). Uygulamaya geçmeden önce bir muhasebeci/avukata danışılmalı. KVKK şirket bilgileri
  (`frontend/src/lib/legal.ts` COMPANY) ve "Makbuz/fatura PDF'i" maddesi de bu kararla bağlantılı (bkz. `EKSIKLER.md`).
- Fiyat yazmadan yapılabilecek güven artırıcı cümle: "İlk 14 gün ücretsiz, kart bilgisi istenmez" (doğru: ödeme alınmıyor).

## YAPILACAKLAR (onaylandı, sırayla)

### 1. Bulunabilirlik (kısa iş, hemen fayda)
- [ ] **Paylaşım önizlemesi:** `index.html`'e description + Open Graph/Twitter etiketleri + paylaşım görseli. Linkin WhatsApp/Instagram'da
      başlık+görselle kart olarak çıkması (berberlere satışta en çok paylaşılacak kanallar).
- [ ] **Sitemap + robots.txt'e sitemap satırı + yapılandırılmış veri (JSON-LD):** Google'da "berber randevu sistemi" aramaları için temel.
      Not: sayfa SPA; ürün sitesi alanı (`isProductHost`) ve `/kayit`, `/yasal/*` sitemap'e girer; `/panel`, `/platform` zaten engelli.
- [ ] **Ölçüm sayacı:** çerezsiz, hafif (ziyaret, "Ücretsiz dene" tıklaması, kayıt tamamlama). Cloudflare Web Analytics betiği CSP'ye
      takılıyor; ya CSP'ye izin verilir ya kendi sunucumuzda basit sayaç kurulur (KVKK: kişisel veri tutmadan).

### 2. İkna eden içerik
- [ ] **İşletme panelinden gerçek ekran görüntüsü** (takvim / günün randevuları): şu an yalnızca müşteri tarafı telefon taslağı var; berberin
      kendi tarafında ne göreceği gösterilmeli.
- [ ] **WhatsApp vurgusu güçlendirilsin:** müşteriye onay + hatırlatma WhatsApp'tan gider, gelmeyen müşteri azalır (güçlü satış cümlesi).
- [ ] **QR afiş vaadi:** işletme panelindeki QR + PVC afiş fikri ("anlaşmalı işletmelere afiş") somut bir vaat olarak eklenebilir
      (ürün kararı kullanıcıda; afiş henüz yapılmadı — bkz. `ISLETME_PANELI_YAPILACAKLAR.md`).
- [ ] **Sosyal kanıt alanı:** ilk pilot berberden bir cümle + dükkân adı gelince eklenecek. SAHTE yorum/sayı KONMAZ.

### 3. Küçük pürüzler
- [ ] Üst menüye "Demo" bağlantısı (şu an demo yalnızca hero ve alttaki başlayın bölümünde).
- [ ] Yeni içerik eklenirken sayfa uzunluğu kontrol edilir; gerekirse bir bölüm kısaltılır.

## Öncelik önerisi
1. Paylaşım önizlemesi + description + sitemap
2. Panel ekran görüntüsü + WhatsApp vurgusu
3. Ölçüm sayacı
4. Demo menü bağlantısı, QR afiş vaadi, sosyal kanıt (pilot sonrası)
