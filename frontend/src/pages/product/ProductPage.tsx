import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Menu, X, Plus, Minus } from 'lucide-react'
import { CONTACT, DEMO_SITE_URL, PRODUCT_NAME } from './content'
import { PanelMockup, PhoneBookingMockup, PhonePanelMockup, TenantSiteMockup } from './mockups'
import './product.css'

/* ---------- Kaydırmayla belirme ---------- */

function useRevealRoot() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !('IntersectionObserver' in window)) return
    const root = document.documentElement
    const els = Array.from(document.querySelectorAll<HTMLElement>('.rv, .rv-clip'))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    root.classList.add('rv-on')
    els.forEach((el) => io.observe(el))
    // Güvenlik ağı: gözlemci bir şekilde tetiklenmezse içerik gizli kalmasın.
    const t = window.setTimeout(() => els.forEach((el) => el.classList.add('is-in')), 6000)
    return () => {
      window.clearTimeout(t)
      io.disconnect()
      root.classList.remove('rv-on')
    }
  }, [])
}

function Rv({
  as: Tag = 'div',
  delay = 0,
  clip,
  className = '',
  children,
}: {
  as?: ElementType
  delay?: number
  clip?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Tag className={`${clip ? 'rv-clip' : 'rv'} ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  )
}

/* ---------- Küçük parçalar ---------- */

const btnBase =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-sm px-6 text-[0.95rem] font-semibold transition-colors'
const btnPrimary = `${btnBase} bg-copper text-ink hover:bg-copper-bright`
const btnGhost = `${btnBase} border border-line-strong text-cream hover:border-copper hover:text-copper-bright`

function Pole({ className = '', anim = false }: { className?: string; anim?: boolean }) {
  return <span aria-hidden className={`pole block ${anim ? 'pole-anim' : ''} ${className}`} />
}

const NAV = [
  { href: '#ozellikler', label: 'Özellikler' },
  { href: '#nasil', label: 'Nasıl çalışır' },
  { href: '#panel', label: 'Panel' },
  { href: '#sss', label: 'SSS' },
]

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="pt-header sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="font-display text-lg tracking-tight text-cream" onClick={() => setOpen(false)}>
          BehTech <span className="italic text-copper-bright">Randevu</span>
        </a>
        <nav aria-label="Sayfa bölümleri" className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-sm text-muted-strong transition-colors hover:text-cream">
              {n.label}
            </a>
          ))}
          <a href="#iletisim" className="inline-flex min-h-11 items-center rounded-sm bg-copper px-5 text-sm font-semibold text-ink hover:bg-copper-bright">
            Demo talep et
          </a>
        </nav>
        <button
          type="button"
          className="-mr-2 flex size-12 items-center justify-center text-cream md:hidden"
          aria-expanded={open}
          aria-controls="mobil-menu"
          aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav id="mobil-menu" aria-label="Sayfa bölümleri" className="border-t border-line bg-ink px-5 pb-5 md:hidden">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="flex min-h-14 items-center justify-between border-b border-line font-display text-xl text-cream"
            >
              {n.label}
            </a>
          ))}
          <a href="#iletisim" onClick={() => setOpen(false)} className={`${btnPrimary} mt-5 w-full`}>
            Demo talep et
          </a>
        </nav>
      )}
    </header>
  )
}

/* ---------- Bölümler ---------- */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div aria-hidden className="pt-hero-glow absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-12 md:grid-cols-12 md:items-center md:gap-8 md:pb-24 md:pt-20">
        <div className="md:col-span-7">
          <Rv>
            <p className="eyebrow flex items-center gap-3">
              <Pole className="h-2 w-10" />
              Berber ve kuaförler için online randevu
            </p>
          </Rv>
          <Rv delay={80}>
            <h1 className="mt-6 font-display text-[2.6rem] font-light leading-[1.04] tracking-tight text-cream min-[400px]:text-5xl md:text-7xl">
              Koltuğunuz dolu,
              <br />
              <span className="italic text-copper-bright">telefonunuz sessiz</span> olsun.
            </h1>
          </Rv>
          <Rv delay={160}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-strong">
              Dükkânınıza özel bir randevu sitesi. Müşterileriniz gece yarısı bile birkaç dokunuşla yerini ayırsın; siz
              makasın başında kalın, ajandanız kendi kendine dolsun.
            </p>
          </Rv>
          <Rv delay={240} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#iletisim" className={btnPrimary}>
              Demo talep et
            </a>
            <a href={DEMO_SITE_URL} target="_blank" rel="noopener noreferrer" className={btnGhost}>
              Canlı demoyu gör <ArrowUpRight size={18} aria-hidden />
            </a>
          </Rv>
          <Rv delay={320}>
            <p className="mt-6 text-sm text-muted">Uygulama indirmek yok, şifre yok. Kurulumu biz yapıyoruz.</p>
          </Rv>
        </div>
        <Rv delay={200} className="md:col-span-5">
          <div className="relative mx-auto w-[min(68vw,17rem)] md:w-full md:max-w-[19rem]">
            <div aria-hidden className="absolute -inset-3 rounded-[2.4rem] border border-line" />
            <PhoneBookingMockup className="relative w-full" />
          </div>
        </Rv>
      </div>
    </section>
  )
}

function Problems() {
  const items = [
    {
      t: 'Makas elinizdeyken telefon çalıyor',
      d: 'Her arama işi böler, müşteri koltukta beklerken siz ajandayı aramak zorunda kalırsınız.',
    },
    {
      t: 'Randevular DM’lerde kayboluyor',
      d: 'Instagram, WhatsApp, arama kaydı... Hangisi onaylandı, hangisi unutuldu, kimse bilmiyor.',
    },
    {
      t: 'Gelmeyen müşteri boş koltuk demek',
      d: 'Net bir randevu kaydı, iptal kuralı ve doğrulanmış telefon numarasıyla boşa giden saatler azalır.',
    },
  ]
  return (
    <section aria-label="Sorun ve çözüm" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-px bg-line px-0 md:grid-cols-3">
        {items.map((it, i) => (
          <Rv key={it.t} delay={i * 90} className="bg-surface px-5 py-8 md:py-10">
            <p className="font-display text-sm italic text-copper-bright">0{i + 1}</p>
            <h3 className="mt-3 font-display text-xl leading-snug text-cream">{it.t}</h3>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-strong">{it.d}</p>
          </Rv>
        ))}
      </div>
      <p className="mx-auto max-w-6xl px-5 py-6 font-display text-lg italic text-muted-strong md:text-xl">
        Hepsinin cevabı tek bir bağlantı: dükkânınızın kendi randevu adresi.
      </p>
    </section>
  )
}

function Group({
  label,
  title,
  items,
}: {
  label: string
  title: string
  items: { t: string; d: string }[]
}) {
  return (
    <Rv className="border-t border-line pt-6">
      <p className="eyebrow">{label}</p>
      <h3 className="mt-3 font-display text-2xl leading-tight text-cream md:text-3xl">{title}</h3>
      <ul className="mt-6 space-y-5">
        {items.map((it) => (
          <li key={it.t} className="grid grid-cols-[0.9rem_1fr] gap-x-3">
            <span aria-hidden className="pole mt-[0.6rem] h-1.5 w-3.5" />
            <div>
              <p className="font-semibold text-cream">{it.t}</p>
              <p className="mt-1 text-[0.95rem] leading-relaxed text-muted-strong">{it.d}</p>
            </div>
          </li>
        ))}
      </ul>
    </Rv>
  )
}

function Features() {
  return (
    <section id="ozellikler" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Rv className="max-w-2xl">
        <p className="eyebrow">Özellikler</p>
        <h2 className="mt-4 font-display text-4xl font-light leading-[1.08] tracking-tight md:text-6xl">
          Müşteriniz için <span className="italic text-copper-bright">kolay</span>, sizin için düzenli.
        </h2>
      </Rv>

      <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <Group
            label="Müşteriler için"
            title="Dört adımda randevu, telefon açmadan"
            items={[
              { t: 'Hizmet, berber, gün ve saat', d: 'Önce hizmet seçilir. Yalnızca o hizmeti veren berberler listelenir; sonra gerçekten boş olan saatler görünür.' },
              { t: 'Ad, telefon, tek seferlik kod', d: 'Telefonuna gelen kodla doğrulama. Uygulama indirmek ya da şifre belirlemek gerekmez.' },
              { t: 'Randevularım ve iptal', d: 'Müşteri randevularını görür, gerekirse randevusundan 2 saat öncesine kadar kendisi iptal eder.' },
              { t: 'Size ait site', d: 'isletmeadi.behtechlabs.com adresinde logonuz, kapak görseliniz, ekip fotoğraflarınız, fiyat listeniz ve adresiniz.' },
            ]}
          />
        </div>
        <Rv delay={120} className="lg:col-span-6">
          <div className="lg:sticky lg:top-24">
            <TenantSiteMockup className="w-full" />
            <p className="mt-3 font-display text-sm italic text-muted">Dükkânınıza özel site, kendi adresinde.</p>
          </div>
        </Rv>
      </div>

      <div id="panel" className="mt-24 grid gap-12 lg:grid-cols-12 lg:gap-10">
        <Rv delay={60} className="order-2 lg:order-1 lg:col-span-6">
          <div className="lg:sticky lg:top-24">
            <PanelMockup className="w-full" />
            <p className="mt-3 font-display text-sm italic text-muted">Günün ajandası, tek bakışta.</p>
          </div>
        </Rv>
        <div className="order-1 lg:order-2 lg:col-span-6">
          <Group
            label="İşletme için"
            title="Dükkânın tüm işleri tek panelde"
            items={[
              { t: 'Bugünün ajandası', d: 'Randevuyu onaylayın, tamamlayın ya da gelmedi olarak işaretleyin. Tamamlarken ödeme yöntemini kaydedin.' },
              { t: 'Yüz yüze gelenleri de ekleyin', d: 'Kapıdan giren müşteriyi elle randevu olarak girin; saat dolu görünsün, çakışma olmasın.' },
              { t: 'Müşteri listesi ve arama', d: 'Kimin ne zaman geldiğini isim ya da telefonla saniyeler içinde bulun.' },
              { t: 'Hizmetler, ekip, çalışma saatleri', d: 'Fiyat ve süreyi girin, hangi berberin hangi hizmeti verdiğini seçin, her berber için haftalık saatleri ve izin günlerini belirleyin.' },
              { t: 'Sahip ve personel rolleri', d: 'Personel yalnızca kendi randevularını görür. Günlük rakamlar panonuzda toplanır.' },
            ]}
          />
        </div>
      </div>

      <div className="mt-24 grid gap-10 md:grid-cols-12">
        <Rv className="md:col-span-4">
          <p className="eyebrow">Güvenilirlik</p>
          <h3 className="mt-3 font-display text-3xl leading-tight md:text-4xl">
            Randevu verdiyseniz, <span className="italic text-copper-bright">orada</span> durur.
          </h3>
        </Rv>
        <div className="grid gap-px bg-line md:col-span-8 md:grid-cols-3">
          {[
            { t: 'Çifte rezervasyon olmaz', d: 'İki kişi aynı dakikada aynı saati seçse bile yalnızca biri alır, diğerine nazikçe başka saat önerilir.' },
            { t: 'Sahte randevuya karşı', d: 'Telefon doğrulaması ve müşteri başına günlük limit, gerçek olmayan randevuları engeller.' },
            { t: 'Her dükkânın verisi ayrı', d: 'Müşteri ve randevu kayıtlarınız yalnızca sizin panelinizde görünür.' },
          ].map((x, i) => (
            <Rv key={x.t} delay={i * 90} className="bg-ink py-1 md:px-5 md:py-0">
              <p className="font-semibold text-cream">{x.t}</p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-strong">{x.d}</p>
            </Rv>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { t: 'Hesabınızı biz açıyoruz', d: 'Dükkânınızın adını, adresini ve logonuzu alıp hesabınızı kuruyoruz. Sizden teknik bir şey beklemiyoruz.' },
    { t: 'Giriş yapıp doldurun', d: 'Panele girin; hizmetlerinizi, ekibinizi ve çalışma saatlerinizi ekleyin. Telefonla da yapabilirsiniz.' },
    { t: 'Bağlantıyı paylaşın', d: 'Instagram biyografinize, Google Haritalar kaydınıza, WhatsApp durumunuza koyun. Müşteri tıklasın, randevusunu alsın.' },
    { t: 'Ajandanız kendiliğinden dolsun', d: 'Gelen randevular panelinizde belirir. Siz onaylayın, tamamlayın, gerisini sistem tutsun.' },
  ]
  return (
    <section id="nasil" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-12 md:py-28">
        <Rv className="md:col-span-4">
          <div className="md:sticky md:top-28">
            <p className="eyebrow">Nasıl çalışır</p>
            <h2 className="mt-4 font-display text-4xl font-light leading-[1.08] md:text-5xl">
              Bir öğleden sonraya <span className="italic text-copper-bright">sığar.</span>
            </h2>
            <p className="mt-5 max-w-sm text-muted-strong">Kurulum sürecinde yanınızdayız; ilk günden bağlantınızı paylaşabilirsiniz.</p>
            <Pole className="mt-8 h-2 w-24" anim />
          </div>
        </Rv>
        <ol className="md:col-span-8">
          {steps.map((s, i) => (
            <Rv as="li" key={s.t} className="grid grid-cols-[3.5rem_1fr] gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 md:grid-cols-[6rem_1fr]">
              <span className="font-display text-6xl font-light italic leading-none text-copper md:text-8xl">{i + 1}</span>
              <div>
                <h3 className="font-display text-2xl leading-snug text-cream md:text-3xl">{s.t}</h3>
                <p className="mt-3 max-w-lg leading-relaxed text-muted-strong">{s.d}</p>
              </div>
            </Rv>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Mobile() {
  return (
    <section aria-labelledby="cep" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-12 md:py-28">
        <Rv className="md:col-span-7">
          <p className="eyebrow">Mobil öncelikli</p>
          <h2 id="cep" className="mt-4 font-display text-5xl font-light leading-[1.05] tracking-tight md:text-7xl">
            Panel <span className="italic text-copper-bright">cebinizde.</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-strong">
            Berber koltuğunun yanında bilgisayar olmaz, telefon olur. Panel baştan telefon için tasarlandı: büyük
            düğmeler, tek elle kullanım, yüklenecek bir şey yok. Tarayıcıdan açın, ana ekrana ekleyin.
          </p>
          <ul className="mt-8 grid gap-3 text-[0.95rem] text-cream sm:grid-cols-2">
            {['Günün ajandası avucunuzda', 'Tek dokunuşla onay ve tamamlama', 'Yeni gelen müşteriyi anında ekleme', 'Her berber kendi telefonundan'].map((x) => (
              <li key={x} className="flex items-center gap-3 border-t border-line pt-3">
                <span aria-hidden className="pole h-1.5 w-3.5 shrink-0" />
                {x}
              </li>
            ))}
          </ul>
        </Rv>
        <Rv delay={120} className="md:col-span-5">
          <div className="mx-auto w-full max-w-[17rem] sm:max-w-xs">
            <PhonePanelMockup className="w-full" />
          </div>
        </Rv>
      </div>
    </section>
  )
}

const FAQ = [
  { q: 'Kurulum ne kadar sürer?', a: 'Hesabınızı biz açıyoruz. Siz hizmetlerinizi, ekibinizi ve çalışma saatlerinizi girdikten sonra aynı gün bağlantınızı paylaşmaya başlayabilirsiniz. Takıldığınız yerde yardım ederiz.' },
  { q: 'Müşterimin uygulama indirmesi gerekir mi?', a: 'Hayır. Müşteri bağlantıya tıklar, tarayıcıda randevusunu alır. Şifre yok; telefonuna gelen kodla doğrulama yeterli.' },
  { q: 'Kendi alan adım olur mu?', a: 'Her dükkân isletmeadi.behtechlabs.com biçiminde kendi adresine kavuşur; logonuz, kapak görseliniz ve fiyat listenizle size ait bir site olarak açılır.' },
  { q: 'Birden fazla berberle çalışabilir miyim?', a: 'Evet. Ekibinizi ekleyin, her berber için hizmetleri, haftalık çalışma saatlerini ve izin günlerini ayrı belirleyin. Personel yalnızca kendi randevularını görür; sahip hepsini görür.' },
  { q: 'Verilerim güvende mi?', a: 'Her dükkânın müşteri ve randevu kayıtları ayrı tutulur ve yalnızca o dükkânın panelinde görünür. Müşteriler randevu için yalnızca ad ve telefon verir.' },
  { q: 'İptaller nasıl işliyor?', a: 'Müşteri randevularını görüntüleyip randevu saatinden 2 saat öncesine kadar kendisi iptal edebilir. İptal edilen saat yeniden boşa çıkar ve başkası alabilir.' },
  { q: 'Fiyat nedir?', a: 'İşletmenizin büyüklüğüne göre; bizimle iletişime geçin.' },
  { q: 'Mevcut randevularımı taşıyabilir miyim?', a: 'Evet. Elinizdeki mevcut randevuları ve müşteri bilgilerini sisteme taşımanıza biz yardımcı oluruz.' },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="sss" className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-12 md:py-28">
      <Rv className="md:col-span-4">
        <p className="eyebrow">Sık sorulanlar</p>
        <h2 className="mt-4 font-display text-4xl font-light leading-[1.08] md:text-5xl">
          Aklınıza takılan <span className="italic text-copper-bright">her şey.</span>
        </h2>
      </Rv>
      <div className="md:col-span-8">
        <div className="border-b border-line">
          {FAQ.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={f.q} className="border-t border-line">
                <h3>
                  <button
                    type="button"
                    id={`faq-b-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-p-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex min-h-16 w-full items-center justify-between gap-4 py-4 text-left font-display text-lg text-cream hover:text-copper-bright md:text-xl"
                  >
                    {f.q}
                    <span aria-hidden className="shrink-0 text-copper">
                      {isOpen ? <Minus size={20} /> : <Plus size={20} />}
                    </span>
                  </button>
                </h3>
                <div id={`faq-p-${i}`} role="region" aria-labelledby={`faq-b-${i}`} className="faq-panel" data-open={isOpen}>
                  <div>
                    <p className="max-w-2xl pb-6 leading-relaxed text-muted-strong">{f.a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Contact() {
  const wa = CONTACT.whatsapp.replace(/\D/g, '')
  const email = CONTACT.email.trim()
  const hasAny = Boolean(wa || email)
  const msg = encodeURIComponent('Merhaba, BehTech Randevu için demo talep etmek istiyorum.')
  return (
    <section id="iletisim" className="relative overflow-hidden border-t border-line bg-surface">
      <Pole className="absolute inset-x-0 top-0 h-1.5 opacity-80" />
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Rv>
          <p className="eyebrow">İletişim</p>
          <h2 className="mt-4 max-w-3xl font-display text-5xl font-light leading-[1.04] tracking-tight md:text-7xl">
            Dükkânınız için <span className="italic text-copper-bright">demo</span> isteyin.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-strong">
            {hasAny
              ? 'Bize yazın; dükkânınıza uygun kurulumu birlikte konuşalım, fiyatı büyüklüğünüze göre netleştirelim.'
              : 'Önce canlı demoda bir müşterinin gözüyle randevu almayı deneyin. İletişim bilgilerimiz çok yakında burada olacak.'}
          </p>
        </Rv>
        <Rv delay={120} className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {wa && (
            <a href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              WhatsApp ile yazın
            </a>
          )}
          {email && (
            <a href={`mailto:${email}?subject=${encodeURIComponent('Demo talebi')}`} className={wa ? btnGhost : btnPrimary}>
              E-posta gönderin
            </a>
          )}
          <a href={DEMO_SITE_URL} target="_blank" rel="noopener noreferrer" className={hasAny ? btnGhost : btnPrimary}>
            Canlı demoyu gör <ArrowUpRight size={18} aria-hidden />
          </a>
        </Rv>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line pb-safe">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} BehTech Labs · {PRODUCT_NAME}
        </p>
        <Link to="/platform/giris" className="inline-flex min-h-11 items-center text-xs text-muted hover:text-cream">
          Platform girişi
        </Link>
      </div>
    </footer>
  )
}

export default function ProductPage() {
  useRevealRoot()
  useEffect(() => {
    const prev = document.title
    document.title = `${PRODUCT_NAME} | Berber ve kuaförler için online randevu`
    return () => {
      document.title = prev
    }
  }, [])
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="min-h-svh bg-ink text-cream">
      <Header />
      <main>
        <Hero />
        <Problems />
        <Features />
        <HowItWorks />
        <Mobile />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}
