// Hukuki metinler ve şirket bilgileri. TEK DOĞRULUK KAYNAĞI.
// Metin değişince hem buradaki `LEGAL_VERSIONS` hem backend/app/core/legal.py sürümü AYNI değere güncellenmeli:
// sürüm değişince müşteriler/işletmeler yeni metni yeniden onaylar, eski onaylar kayıtta kalır.
//
// ÖNEMLİ: Bu metinler hukuki inceleme yapılmamış TASLAKTIR. Canlıya almadan önce bir avukata gösterilmeli
// ve aşağıdaki COMPANY bilgileri doldurulmalıdır (bkz. docs/EKSIKLER.md §7).

export const COMPANY = {
  name: '', // Ünvan (şahıs şirketiyse ad-soyad)
  taxNo: '', // Vergi kimlik numarası
  address: '',
  email: '', // Genel iletişim
  kvkkEmail: '', // KVKK başvuru adresi
  phone: '',
}

export const LEGAL_VERSIONS = {
  customerPrivacy: '2026-10-16',
  tenantTerms: '2026-10-16',
}

export type LegalSlug = 'aydinlatma' | 'gizlilik' | 'sartlar' | 'veri-isleme'

export interface LegalDoc {
  slug: LegalSlug
  title: string
  updated: string
  sections: { heading: string; paragraphs: string[] }[]
}

const UPDATED = '16 Ekim 2026'
const BRAND = 'BehTech Randevu'

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  aydinlatma: {
    slug: 'aydinlatma',
    title: 'Kişisel Verilerin İşlenmesi Hakkında Aydınlatma Metni',
    updated: UPDATED,
    sections: [
      {
        heading: 'Veri sorumlusu kimdir?',
        paragraphs: [
          'Randevu aldığınız işletme (berber/kuaför), kişisel verilerinizin işlenme amaç ve yöntemlerini belirleyen "veri sorumlusu"dur. İşletmenin adı ve iletişim bilgileri randevu sayfasında yer alır.',
          `${BRAND} yazılımı, işletmenin adına ve onun talimatlarıyla verilerinizi işleyen "veri işleyen"dir. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun (KVKK) 10. maddesi kapsamındaki aydınlatma yükümlülüğü için hazırlanmıştır.`,
        ],
      },
      {
        heading: 'Hangi verilerinizi işliyoruz?',
        paragraphs: [
          'Telefon numaranız, adınız ve soyadınız, randevu bilgileriniz (tarih, saat, hizmet, berber, durum), doğrulama kodu işlemlerinize ilişkin kayıtlar ve güvenlik amacıyla IP adresiniz ile işlem zamanınız.',
        ],
      },
      {
        heading: 'Verilerinizi hangi amaçlarla işliyoruz?',
        paragraphs: [
          'Randevunuzu oluşturmak, yönetmek, değiştirmek veya iptal etmek; telefon numaranızı doğrulamak ve hesabınızı korumak; randevunuzla ilgili bilgilendirme ve hatırlatma yapmak; kötüye kullanımı ve güvenlik ihlallerini önlemek; yasal yükümlülükleri yerine getirmek.',
        ],
      },
      {
        heading: 'Hukuki sebep',
        paragraphs: [
          'Verileriniz KVKK m.5/2 uyarınca; bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (randevu hizmeti), veri sorumlusunun meşru menfaati (güvenlik ve kötüye kullanımın önlenmesi) ve hukuki yükümlülüğün yerine getirilmesi sebeplerine dayanılarak işlenir.',
        ],
      },
      {
        heading: 'Verilerin aktarılması',
        paragraphs: [
          'Verileriniz; randevu hizmetinin sunulması için işletme ve işletme çalışanlarıyla, yazılım ve barındırma hizmeti sağlayan veri işleyenle paylaşılır. Doğrulama kodları ve bildirimler WhatsApp üzerinden iletildiğinde, mesaj içeriği ve telefon numaranız bu hizmetin altyapı sağlayıcısı üzerinden geçer. Yasal bir talep olması hâlinde yetkili kurum ve kuruluşlarla paylaşılabilir. Verileriniz ticari amaçla üçüncü kişilere satılmaz.',
        ],
      },
      {
        heading: 'Saklama süresi',
        paragraphs: [
          'Verileriniz, işletmeyle hizmet ilişkiniz boyunca ve ilgili mevzuatta öngörülen zamanaşımı süreleri kadar saklanır; sürenin dolmasının ardından silinir, yok edilir veya anonim hâle getirilir. Doğrulama kodları kısa süre içinde geçersiz olur.',
        ],
      },
      {
        heading: 'Haklarınız',
        paragraphs: [
          'KVKK m.11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, KVKK m.7 çerçevesinde silinmesini veya yok edilmesini isteme, bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.',
        ],
      },
      {
        heading: 'Başvuru yöntemi',
        paragraphs: [
          'Taleplerinizi öncelikle randevu aldığınız işletmeye iletebilirsiniz. Veri işleyen olarak bize ulaşmak için bu sayfadaki iletişim bilgilerini kullanabilirsiniz; talebiniz en geç otuz gün içinde sonuçlandırılır.',
        ],
      },
    ],
  },

  gizlilik: {
    slug: 'gizlilik',
    title: 'Gizlilik Politikası',
    updated: UPDATED,
    sections: [
      {
        heading: 'Kapsam',
        paragraphs: [
          `Bu politika, ${BRAND} tanıtım sitesini, işletme panelini ve işletmelerin müşteri randevu sitelerini kullanırken verilerinizin nasıl işlendiğini açıklar. Randevu alan müşterilere yönelik ayrıntılı bilgi "Aydınlatma Metni"nde yer alır.`,
        ],
      },
      {
        heading: 'Topladığımız bilgiler',
        paragraphs: [
          'İşletme sahibi ve personel için: ad, soyad, telefon numarası, şifre (yalnızca geri döndürülemez şekilde karıştırılmış hâliyle), isteğe bağlı e-posta ve işletme bilgileri. Müşteriler için: telefon, ad-soyad ve randevu bilgileri. Tüm kullanıcılar için: güvenlik kayıtları (giriş denemeleri, IP adresi, işlem zamanı).',
        ],
      },
      {
        heading: 'Rollerimiz',
        paragraphs: [
          'İşletmenin müşterilerine ait veriler bakımından işletme veri sorumlusu, biz veri işleyeniz; yalnızca işletmenin talimatı ve hizmetin sunulması için bu verileri işleriz. İşletme sahibi ve personel hesapları, kayıt ve faturalama bilgileri bakımından ise veri sorumlusu biziz.',
        ],
      },
      {
        heading: 'Güvenlik',
        paragraphs: [
          'Şifreler karıştırılarak saklanır, bağlantılar şifreli (HTTPS) kurulur, her işletmenin verisi diğer işletmelerden ayrı tutulur, hatalı giriş denemeleri sınırlandırılır ve yönetim işlemleri denetim kaydına yazılır. Hiçbir sistemin tamamen risksiz olmadığını, bir ihlal durumunda mevzuatın öngördüğü bildirimleri yapacağımızı belirtiriz.',
        ],
      },
      {
        heading: 'Destek erişimi',
        paragraphs: [
          'Teknik destek için yetkili platform yöneticisi, işletmenin panelini destek modunda açabilir. Bu erişimler kayıt altına alınır ve işletme panelinde belirgin şekilde gösterilir.',
        ],
      },
      {
        heading: 'Çerezler ve yerel depolama',
        paragraphs: [
          'Oturumunuzu sürdürmek ve tercihlerinizi (ör. "beni hatırla", aydınlatma metni onayı) hatırlamak için tarayıcınızın yerel depolamasını kullanırız. Reklam veya izleme amaçlı üçüncü taraf çerez kullanmayız.',
        ],
      },
      {
        heading: 'Haklarınız ve iletişim',
        paragraphs: [
          'KVKK kapsamındaki haklarınız ve başvuru yöntemi için Aydınlatma Metni\'ne bakabilirsiniz. Hesabınızın veya verilerinizin silinmesini bu sayfadaki iletişim bilgilerinden talep edebilirsiniz.',
        ],
      },
    ],
  },

  sartlar: {
    slug: 'sartlar',
    title: 'Kullanım Şartları (İşletmeler İçin)',
    updated: UPDATED,
    sections: [
      {
        heading: 'Taraflar ve konu',
        paragraphs: [
          `Bu şartlar, ${BRAND} hizmetini kullanan işletme ("İşletme") ile hizmeti sunan ("Sağlayıcı") arasındadır. Hizmet; çevrimiçi randevu alma sitesi, işletme paneli ve ilgili bildirimlerden oluşur. Kayıt formunu onaylayarak bu şartları kabul etmiş olursunuz.`,
        ],
      },
      {
        heading: 'Hesap ve kayıt',
        paragraphs: [
          'Kayıt bilgilerinin doğru ve güncel olması İşletme\'nin sorumluluğundadır. Başvurular Sağlayıcı tarafından incelenir; Sağlayıcı gerekçe göstermeden başvuruyu reddetme hakkını saklı tutar. Hesap şifresinin gizliliği ve hesap üzerinden yapılan işlemler İşletme\'ye aittir.',
        ],
      },
      {
        heading: 'Deneme ve ücretlendirme',
        paragraphs: [
          'Onaylanan hesaba 14 günlük ücretsiz deneme tanımlanır. Deneme süresi bittiğinde, ücretli döneme geçilmezse hesap otomatik olarak askıya alınır; veriler silinmez. Ücretler ve ödeme yöntemi (şu an havale/EFT) panelde ve ödeme talebinde belirtilir. Ödeme süresi geçen hesaplar, bildirim ve ek süre sonrasında askıya alınabilir.',
        ],
      },
      {
        heading: 'Kullanım kuralları',
        paragraphs: [
          'Hizmet hukuka ve genel ahlaka uygun kullanılmalıdır. Müşterilere istenmeyen mesaj gönderilmesi, hizmetin kötüye kullanılması, güvenlik önlemlerinin aşılması ve başkasının verisine yetkisiz erişim yasaktır. İşletme, müşterilerinden gereken aydınlatma ve izinleri almaktan ve müşteri verilerini hukuka uygun kullanmaktan sorumludur.',
        ],
      },
      {
        heading: 'Hizmet düzeyi',
        paragraphs: [
          'Sağlayıcı hizmeti kesintisiz sunmak için makul çabayı gösterir; bakım, altyapı sağlayıcılarındaki sorunlar veya mücbir sebeplerle kesintiler yaşanabilir. WhatsApp üzerinden iletilen doğrulama ve bildirim mesajlarının teslimi üçüncü taraf altyapılara bağlıdır ve garanti edilmez.',
        ],
      },
      {
        heading: 'Sorumluluğun sınırı',
        paragraphs: [
          'Sağlayıcının sorumluluğu, kasıt ve ağır kusur hâlleri saklı kalmak üzere, İşletme\'nin son on iki ayda hizmet için ödediği tutarla sınırlıdır. Kâr kaybı gibi dolaylı zararlardan sorumluluk kabul edilmez.',
        ],
      },
      {
        heading: 'Fesih ve verilerin akıbeti',
        paragraphs: [
          'İşletme dilediği zaman hizmeti bırakabilir. Şartların ihlali veya ödeme yapılmaması hâlinde Sağlayıcı hesabı askıya alabilir veya sonlandırabilir. Sonlanmadan sonra İşletme, verilerinin dışa aktarılmasını veya silinmesini talep edebilir; yasal saklama yükümlülükleri saklıdır.',
        ],
      },
      {
        heading: 'Değişiklikler ve uyuşmazlık',
        paragraphs: [
          'Şartlar güncellenebilir; önemli değişiklikler panel üzerinden duyurulur ve gerekirse yeniden onay alınır. Uyuşmazlıklarda Türk hukuku uygulanır; Sağlayıcının yerleşim yeri mahkemeleri ve icra daireleri yetkilidir.',
        ],
      },
    ],
  },

  'veri-isleme': {
    slug: 'veri-isleme',
    title: 'Kişisel Verileri İşleme Sözleşmesi',
    updated: UPDATED,
    sections: [
      {
        heading: 'Taraflar ve amaç',
        paragraphs: [
          `Bu sözleşme, müşterilerinin kişisel verilerini ${BRAND} hizmeti üzerinden işleten işletme ("Veri Sorumlusu") ile hizmeti sunan Sağlayıcı ("Veri İşleyen") arasında, 6698 sayılı KVKK ve ilgili mevzuata uygun olarak akdedilmiştir. Kullanım Şartları'nın ayrılmaz parçasıdır.`,
        ],
      },
      {
        heading: 'İşlenen veriler ve amaç',
        paragraphs: [
          'Konu: İşletmenin müşterilerine ait ad-soyad, telefon, randevu ve doğrulama kayıtları ile işletme personeline ait hesap bilgileri. Amaç: yalnızca randevu hizmetinin sunulması, doğrulama ve bildirimlerin iletilmesi, raporlama ve güvenliğin sağlanması. Süre: hizmet ilişkisinin süresi.',
        ],
      },
      {
        heading: 'Veri İşleyen\'in yükümlülükleri',
        paragraphs: [
          'Verileri yalnızca Veri Sorumlusu\'nun yazılı talimatları (ürünün kullanımı dahil) ve hizmetin gerekleri doğrultusunda işler; amaç dışı kullanmaz ve üçüncü kişilerle paylaşmaz. Verilere erişimi yetkili ve gizlilik yükümlülüğü altındaki kişilerle sınırlar. KVKK m.12 uyarınca uygun teknik ve idari tedbirleri alır: erişim kontrolü, işletmeler arası veri ayrımı, şifreleme/karıştırma, hatalı giriş sınırı, denetim kaydı ve düzenli yedekleme.',
        ],
      },
      {
        heading: 'Alt işleyenler',
        paragraphs: [
          'Veri İşleyen; barındırma, e-posta ve WhatsApp mesaj iletimi gibi hizmetlerde alt işleyenlerden yararlanabilir. Alt işleyenler bu sözleşmedeki yükümlülüklerle uyumlu olmak zorundadır ve Veri İşleyen onlardan sorumludur. Güncel alt işleyen bilgisi talep üzerine verilir.',
        ],
      },
      {
        heading: 'Veri ihlali bildirimi',
        paragraphs: [
          'Veri İşleyen, verilerin hukuka aykırı olarak ele geçirildiğini öğrendiğinde gecikmeksizin Veri Sorumlusu\'nu bilgilendirir; Veri Sorumlusu, mevzuattaki yetkili kuruma ve ilgili kişilere yapılacak bildirimlerden sorumludur.',
        ],
      },
      {
        heading: 'İlgili kişi başvuruları',
        paragraphs: [
          'Veri Sorumlusu, müşterilerinden gelen başvuruları yanıtlamakla yükümlüdür. Veri İşleyen, bu başvuruların karşılanması için makul teknik yardımı sağlar ve kendisine doğrudan gelen başvuruları Veri Sorumlusu\'na iletir.',
        ],
      },
      {
        heading: 'Veri Sorumlusu\'nun yükümlülükleri',
        paragraphs: [
          'Müşterilere gerekli aydınlatmayı yapmak (randevu sitesindeki Aydınlatma Metni bu amaçla sunulur, işletme kendi unvan ve iletişim bilgilerini bu metinle birlikte sağlamakla sorumludur), verilerin hukuka uygun elde edildiğini ve talimatlarının mevzuata uygun olduğunu sağlamak.',
        ],
      },
      {
        heading: 'Sona erme ve verilerin iadesi/silinmesi',
        paragraphs: [
          'Hizmet ilişkisi sona erdiğinde Veri İşleyen, Veri Sorumlusu\'nun talebine göre verileri iade eder veya siler/anonim hâle getirir; yasal saklama yükümlülükleri ve yedeklerin döngüsel silinme süresi saklıdır.',
        ],
      },
    ],
  },
}
