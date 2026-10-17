# Platform Paneline Eklenecekler

Beyin fırtınası: 2026-10-17. Platform (sahip) panelinin mevcut sayfaları: Genel Bakış, Başvurular, İşletmeler (+detay), Ödemeler,
Paketler, Duyurular, Denetim, Sistem, Yöneticiler, Ayarlar. Aşağıdakiler henüz YAPILMADI; hepsi kullanıcı tarafından
"mantıklı" bulundu. Sıra/öncelik önerisi en altta. Yapılanları işaretle (`- [x]`), yeni fikirleri ilgili başlığa ekle.
Genel kapsam kararları ve eksikler: `EKSIKLER.md`. İşletme (admin) paneli için ayrı beyin fırtınası yapılacak.

## 1. Bugün ne yapmalıyım? (aksiyon odaklı)
- [x] (2026-10-17 YAPILDI: Genel Bakış'ın en üstünde "Bugün ne yapmalıyım?" kartı; `GET /platform/actions`) **Aksiyon kuyruğu (Genel Bakış):** tek liste — bekleyen başvurular, vadesi yaklaşan/geçen ödemeler, WhatsApp'ı kopan işletmeler,
      deneme süresi bitmek üzere olanlar. Şu an bunlar farklı sayfalara dağılmış.
- [x] (2026-10-17 YAPILDI: 24 saattir okunmayan acil bildirim aksiyon kuyruğunda görünür) **Okunmamış bildirim takibi:** acil bildirim gönderilen işletme günlerdir okumadıysa panelde öne çıksın
      (altyapı var: `notifications.read_at`, `announcement_reads`; yalnızca gösterim eksik).

## 2. İşletme sağlığı ve kullanım
- [x] (2026-10-17 YAPILDI: `staff.last_login_at` + son randevu oluşturma; İşletmeler listesinde "Son etkinlik" sütunu, detayda "Son etkinlik" kartı, 14 gündür sessiz faturalı işletme aksiyon kuyruğunda "Bilgi"; giriş verisi canlıya geçişten sonra dolmaya başlar) **Son etkinlik:** her işletme için son giriş ve son randevu zamanı; "14 gündür randevu yok" listesi (vazgeçme riski).
- [x] (ZATEN VARDI: işletme detayında "Kurulum durumu" kartı ve listede "Kurulum" sütunu; platform bunu `SetupOut` ile gösteriyor) **Kurulum ilerlemesi:** işletme panelindeki kurulum rehberi adımlarının platformda görünmesi (demo'da takılanlar, WhatsApp'ı bağlamayanlar).
- [x] (2026-10-17 YAPILDI: Genel Bakış'ta "Kayıttan ödemeye" kartı, `GET /platform/funnel`; yalnızca kendi kayıt olan işletmeler, "ulaştı" mantığıyla her zaman azalan) **Dönüşüm hunisi:** kayıt -> onay -> kurulum tamam -> ilk randevu -> ilk ödeme; hangi aşamada kayıp var.
- [x] (2026-10-17 YAPILDI: işletme detayı "Son etkinlik" kartında son 30 gün randevu ve başarılı WhatsApp mesajı sayısı; listede/limitlerde gösterilmiyor) **Kullanım sayıları:** işletme başına aylık randevu ve WhatsApp mesajı (fiyatlandırma + kötüye kullanım tespiti).

## 3. Para
- [ ] **Gelir görünümü:** aylık düzenli gelir (MRR), tahsil edilen / bekleyen / gecikmiş, aylık grafik.
- [ ] **CSV dışa aktarma:** ödemeler listesi (muhasebe için).
- [ ] **Makbuz/fatura PDF'i:** ödeme alınınca işletmeye verilecek belge (KVKK/şirket bilgileri hazır olunca anlamlı).
- [ ] **Kupon kodu:** şu an yalnızca elle yüzde indirimi var; kayıt sırasında girilebilen kod sistemi sonraya.

## 4. Sistem güvenliği ve işletmeye hazırlık
- [x] (2026-10-17 YAPILDI; ayrıca canlıda yedek kartının yanlış klasöre baktığı hata düzeltildi) **Yedek durumu panelde (Sistem):** son yedek zamanı, boyut, geri yükleme doğrulandı mı (`verify_backup.py` henüz kurulu değil).
- [x] (2026-10-17 YAPILDI: `error_events` + Sistem sayfasında "Sunucu hataları" kartı; son 1 saatte ≥5 hata aksiyon kuyruğunda) **Hata sayacı:** son 24 saatte 5xx sayısı (çökme/yavaşlık erken uyarısı).
- [x] (2026-10-17 YAPILDI: Yöneticiler sayfasında "Giriş geçmişi" -> Denetim kaydı filtreli [Hesap + telefon]; hatalı giriş denemeleri ve "yeni adresten giriş" işareti kaydedilir, yeni adresten girişte sahibine anlık bildirim; "Yedek" hesabı güvenlik riski ayrıca duruyor) **Yönetici giriş geçmişi:** hangi yönetici, ne zaman, hangi IP'den girdi (denetim kaydında işlemler var, girişler yok);
      "Yedek" yönetici hesabı riski de burada görünür olur.
- [x] (2026-10-17 YAPILDI: günlük `backup.sh` host_status.json yazar; Sistem "Sunucu" kartı + aksiyon kuyruğu: disk ≥%85, sertifika ≤14 gün) **Sertifika bitişi ve disk doluluğu uyarısı.**
- [ ] **Dış izleme (UptimeRobot vb.):** KARAR: sistem tam hazır olduktan sonra yapılacak (sunucu düşerse telefona haber).
      Şimdilik YAPILMAYACAK.

## 5. Uyum ve iletişim
- [ ] **KVKK araçları:** işletme verisini dışa aktar; işletmeyi silme/arşivleme akışı (silme sonrası saklama süresi). İlk gerçek müşteride gerekir.
- [x] (2026-10-17 YAPILDI: işletme panelinde Bildirimler > "Bize yazın" [yalnızca yönetici], platformda "Destek" sayfası + menü rozeti + aksiyon kuyruğu; yanıt işletmenin bildirim kutusuna düşer ve talep kapanır; açık talep sınırı 5, günlük 10; yeni talepte platform sahibine push/e-posta) **İşletmeden platforma mesaj ("destek talebi"):** bildirim kutusu tek yönlü; basit bir talep formu panelde toplansın.
- [ ] **Toplu işlemler:** İşletmeler listesinde çoklu seçimle toplu bildirim / etiketleme.
- [ ] **Etiketler:** işletmeye serbest etiket ("pilot", "sorunlu", "VIP") ve etikete göre filtre.

## Öncelik önerisi (gerçek müşteri gelmeden önce)
1. Aksiyon kuyruğu
2. Yedek durumu + hata sayacı (dış izleme sistem hazır olunca)
3. Son etkinlik + kurulum ilerlemesi
4. İşletmeden destek talebi

Gelir grafiği, CSV, makbuz/fatura: ilk ödemeler gelmeye başlayınca.
