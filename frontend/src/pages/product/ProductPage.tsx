import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, Bell, CalendarCheck, CalendarX2, Check, Gift, KeyRound, Link2, Menu, MessageCircle, Minus,
  Mail, MousePointerClick, PhoneMissed, Plus, RotateCcw, Scissors, Share2, ShieldCheck, Smartphone, UserPlus, Users, Wallet, X,
} from 'lucide-react'
import { ThemeToggle } from '../../lib/theme'
import { BrandCredit } from '../../components/BrandCredit'
import { LegalLink } from '../../components/LegalModal'
import { BASE_DOMAIN } from '../../lib/site'
import { startSiteStats } from '../../lib/siteStats'
import type { LegalSlug } from '../../lib/legal'
import { InstagramIcon } from '../../components/ContactLinks'
import { CONTACT, DEMO_SITE_URL, instagramHandle, PRODUCT_NAME } from './content'
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
const btnPrimary = `${btnBase} bg-copper text-on-accent hover:bg-copper-bright`
const btnGhost = `${btnBase} border border-line-strong text-cream hover:border-copper hover:text-copper-bright`

/** Kelimeleri sırayla yumuşak geçişle değiştirir; aynı anda tek biri görünür. Genişlik en uzun kelimeye sabit
 * (yerleşim zıplamaz). Ekran okuyucu hepsini tek seferde okur; hareket azaltma açıksa yalnızca ilki durur. */
function RotatingWords({ words, interval = 2600 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setI((n) => (n + 1) % words.length), interval)
    return () => window.clearInterval(t)
  }, [words.length, interval])
  return (
    <span className="relative inline-grid">
      <span className="sr-only">{words.join(', ')}</span>
      {words.map((w, n) => (
        <span
          key={w}
          aria-hidden="true"
          className={`col-start-1 row-start-1 transition-all duration-500 ease-out ${n === i ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'}`}
        >
          {w}
        </span>
      ))}
    </span>
  )
}

function Pole({ className = '', anim = false }: { className?: string; anim?: boolean }) {
  return <span aria-hidden className={`pole block ${anim ? 'pole-anim' : ''} ${className}`} />
}

const NAV: { href: string; label: string; external?: boolean }[] = [
  { href: '#ozellikler', label: 'Özellikler' },
  { href: '#nasil', label: 'Nasıl çalışır' },
  { href: DEMO_SITE_URL, label: 'Demo', external: true },
  { href: '#sss', label: 'SSS' },
  { href: '#iletisim', label: 'İletişim' },
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
            <a
              key={n.href}
              href={n.href}
              {...(n.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="text-sm text-muted-strong transition-colors hover:text-cream"
            >
              {n.label}
            </a>
          ))}
          <Link to="/kayit" className="inline-flex min-h-11 items-center rounded-sm bg-copper px-5 text-sm font-semibold text-on-accent hover:bg-copper-bright">
            Ücretsiz dene
          </Link>
          <ThemeToggle className="-mr-2" />
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
              {...(n.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={() => setOpen(false)}
              className="flex min-h-14 items-center justify-between border-b border-line font-display text-xl text-cream"
            >
              {n.label}
            </a>
          ))}
          <ThemeToggle withLabel className="mt-1 w-full border-b border-line" />
          <Link to="/kayit" onClick={() => setOpen(false)} className={`${btnPrimary} mt-5 w-full`}>
            Ücretsiz dene
          </Link>
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
              <RotatingWords words={['Berberler için', 'Kuaförler için']} />
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
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-strong">
              Müşteriniz randevusunu kendisi alır. Siz makasa bakarsınız.
            </p>
          </Rv>
          <Rv delay={240} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/kayit" className={btnPrimary}>
              Ücretsiz dene
            </Link>
            <a href={DEMO_SITE_URL} target="_blank" rel="noopener noreferrer" className={btnGhost}>
              Canlı demoyu gör <ArrowUpRight size={18} aria-hidden />
            </a>
          </Rv>
          <Rv delay={320}>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-strong">
              {[
                { i: Smartphone, t: 'Uygulama yok' },
                { i: KeyRound, t: 'Şifre yok' },
                { i: Gift, t: '14 gün ücretsiz' },
              ].map(({ i: Icon, t }) => (
                <li key={t} className="flex items-center gap-2">
                  <Icon className="size-4 text-copper" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
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

/** Önce / sonra: dağınık bildirimler -> tek düzenli randevu. Yazı yerine görsel anlatım. */
function BeforeAfter() {
  const chaos = [
    { icon: PhoneMissed, t: '3 cevapsız arama', tone: 'text-danger', rot: '-rotate-2' },
    { icon: MessageCircle, t: '“Yarın 3’te boş mu?”', tone: 'text-muted-strong', rot: 'rotate-1 md:translate-x-6' },
    { icon: MessageCircle, t: '“Abi saat kaçtı?”', tone: 'text-muted-strong', rot: '-rotate-1 md:-translate-x-2' },
    { icon: CalendarX2, t: 'Gelmedi, koltuk boş', tone: 'text-warning', rot: 'rotate-2 md:translate-x-4' },
  ]
  return (
    <section aria-label="Önce ve sonra" className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-[1fr_auto_1fr] md:gap-8 md:py-24">
        <Rv>
          <p className="eyebrow text-muted">Önce</p>
          <ul className="mt-6 flex flex-col gap-3">
            {chaos.map(({ icon: Icon, t, tone, rot }) => (
              <li
                key={t}
                className={`flex w-fit max-w-full items-center gap-3 rounded-md border border-line bg-surface-raised px-4 py-3 shadow-pop ${rot}`}
              >
                <Icon className={`size-5 shrink-0 ${tone}`} aria-hidden="true" />
                <span className="text-[0.95rem] text-cream">{t}</span>
              </li>
            ))}
          </ul>
        </Rv>

        <Rv delay={120} className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-full border border-copper/50 bg-copper/10 text-copper-bright">
            <ArrowRight className="size-6 rotate-90 md:rotate-0" aria-hidden="true" />
          </span>
        </Rv>

        <Rv delay={200}>
          <p className="eyebrow">Sonra</p>
          <div className="mt-6 rounded-md border border-copper/40 bg-surface-raised p-5 shadow-pop">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
                <CalendarCheck className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Yeni randevu</p>
                <p className="font-display text-xl text-cream">Mehmet K.</p>
              </div>
              <span className="ml-auto font-display text-2xl text-copper-bright tabular-nums">14:30</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-sm border border-line px-2.5 py-1 text-muted-strong">Saç + Sakal</span>
              <span className="rounded-sm border border-line px-2.5 py-1 text-muted-strong">Kerem</span>
              <span className="inline-flex items-center gap-1 rounded-sm bg-success/10 px-2.5 py-1 text-success">
                <Check className="size-3.5" aria-hidden="true" /> Doğrulanmış telefon
              </span>
            </div>
          </div>
          <p className="mt-5 font-display text-lg italic text-muted-strong">Tek bağlantı. Tek ajanda.</p>
        </Rv>
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: MousePointerClick, t: '4 adımda randevu', d: 'Hizmet, berber, saat, onay.' },
  { icon: ShieldCheck, t: 'Telefon doğrulama', d: 'Sahte randevu yok.' },
  { icon: CalendarCheck, t: 'Çakışma yok', d: 'Aynı saati iki kişi alamaz.' },
  { icon: Users, t: 'Ekip ve roller', d: 'Herkes kendi ajandasını görür.' },
  { icon: Wallet, t: 'Gelir raporu', d: 'Günlük, aylık, yıllık.' },
  { icon: RotateCcw, t: 'Kolay iptal', d: 'Boşalan saat yeniden satışa çıkar.' },
]

function Features() {
  return (
    <section id="ozellikler" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Rv className="max-w-2xl">
        <p className="eyebrow">Özellikler</p>
        <h2 className="mt-4 font-display text-4xl font-light leading-[1.08] tracking-tight md:text-6xl">
          Müşteriniz için <span className="italic text-copper-bright">kolay</span>, sizin için düzenli.
        </h2>
      </Rv>

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        {[
          { m: <TenantSiteMockup className="w-full" />, k: 'Müşteri tarafı', t: 'Size ait randevu sitesi', d: `isletmeadi.${BASE_DOMAIN}` },
          { m: <PanelMockup className="w-full" />, k: 'İşletme tarafı', t: 'Tüm işler tek panelde', d: 'Ajanda, müşteriler, ekip, gelir' },
        ].map((x, i) => (
          <Rv key={x.t} delay={i * 120} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
            <div className="border-b border-line bg-surface-raised p-4 md:p-6">{x.m}</div>
            <div className="p-5 md:p-6">
              <p className="eyebrow">{x.k}</p>
              <h3 className="mt-2 font-display text-2xl text-cream">{x.t}</h3>
              <p className="mt-1 text-muted-strong">{x.d}</p>
            </div>
          </Rv>
        ))}
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, t, d }, i) => (
          <Rv as="li" key={t} delay={(i % 3) * 80} className="bg-surface p-5 md:p-7">
            <Icon className="size-6 text-copper" aria-hidden="true" />
            <p className="mt-4 font-display text-lg leading-snug text-cream md:text-xl">{t}</p>
            <p className="mt-1 text-sm text-muted-strong">{d}</p>
          </Rv>
        ))}
      </ul>
    </section>
  )
}

/** WhatsApp bildirimleri: onay + hatırlatma + "iptal" yanıtı. Metinler gerçek mesaj şablonlarıyla aynı üsluptadır. */
function WhatsappBand() {
  const bullets = [
    { icon: Check, t: 'Randevu onayı', d: 'Alınır alınmaz müşterinize' },
    { icon: Bell, t: 'Hatırlatma', d: 'Randevudan 1 saat önce' },
    { icon: RotateCcw, t: '“İptal” yazması yeter', d: 'Boşalan saat yeniden satışa çıkar' },
  ]
  return (
    <section aria-labelledby="whatsapp" className="border-t border-line">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-12 md:py-28">
        <Rv className="md:col-span-6">
          <p className="eyebrow">WhatsApp</p>
          <h2 id="whatsapp" className="mt-4 font-display text-4xl font-light leading-[1.08] tracking-tight md:text-6xl">
            Müşteri <span className="italic text-copper-bright">unutmaz.</span>
          </h2>
          <p className="mt-5 max-w-md text-lg text-muted-strong">Onay ve hatırlatma, kendi WhatsApp numaranızdan gider.</p>
          <ul className="mt-8 grid gap-3">
            {bullets.map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex items-center gap-4 rounded-md border border-line bg-surface px-4 py-3">
                <Icon className="size-5 shrink-0 text-copper" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-cream">{t}</span>
                  <span className="block text-sm text-muted-strong">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </Rv>
        <Rv delay={120} className="md:col-span-6">
          <div aria-hidden className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4 md:p-5">
            <div className="max-w-[88%] self-start rounded-md rounded-tl-none border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-cream shadow-sm">
              <p>Sayın Ali,</p>
              <p className="mt-2">✅ Randevunuz onaylanmıştır.</p>
              <p className="mt-2 text-muted-strong">
                Tarih: Cumartesi 24 Ekim
                <br />
                Saat: 14:30
                <br />
                Hizmet: Saç + Sakal
              </p>
              <p className="mt-2 text-xs text-muted-strong">İptal etmek için bu mesaja “iptal” yazarak yanıt verebilirsiniz.</p>
            </div>
            <div className="max-w-[60%] self-end rounded-md rounded-tr-none bg-copper px-4 py-2.5 text-sm font-medium text-on-accent">iptal</div>
            <div className="max-w-[88%] self-start rounded-md rounded-tl-none border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-cream shadow-sm">
              Randevunuz iptal edilmiştir. Yeni randevu için bağlantı aşağıdadır.
            </div>
          </div>
        </Rv>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { icon: UserPlus, t: 'Kaydolun', d: '2 dakikalık form' },
    { icon: Scissors, t: 'Doldurun', d: 'Hizmet, ekip, saatler' },
    { icon: Share2, t: 'Paylaşın', d: 'Instagram, WhatsApp, Haritalar' },
  ]
  return (
    <section id="nasil" className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Rv className="text-center">
          <p className="eyebrow">Nasıl çalışır</p>
          <h2 className="mt-4 font-display text-4xl font-light leading-[1.08] md:text-5xl">
            Bir öğleden sonraya <span className="italic text-copper-bright">sığar.</span>
          </h2>
        </Rv>

        <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
          <span aria-hidden className="pole pole-anim absolute left-[16%] right-[16%] top-8 hidden h-1 opacity-50 md:block" />
          {steps.map(({ icon: Icon, t, d }, i) => (
            <Rv as="li" key={t} delay={i * 120} className="relative flex flex-col items-center text-center">
              <span className="relative flex size-16 items-center justify-center rounded-full border border-copper/50 bg-surface-raised text-copper-bright shadow-pop">
                <Icon className="size-7" aria-hidden="true" />
                <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-copper text-xs font-semibold text-on-accent">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-5 font-display text-2xl text-cream">{t}</h3>
              <p className="mt-1 text-muted-strong">{d}</p>
            </Rv>
          ))}
        </ol>

        <Rv delay={200} className="mx-auto mt-14 flex max-w-md items-center gap-3 rounded-full border border-line-strong bg-surface-raised px-5 py-3 shadow-pop">
          <Link2 className="size-5 shrink-0 text-copper" aria-hidden="true" />
          <span className="min-w-0 truncate text-cream">
            <span className="text-copper-bright">dukkaniniz</span>.{BASE_DOMAIN}
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-copper px-3 py-1 text-xs font-semibold text-on-accent">Randevu al</span>
        </Rv>
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
          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: CalendarCheck, t: 'Günün ajandası' },
              { icon: Check, t: 'Tek dokunuşla tamamla' },
              { icon: Plus, t: 'Kapıdan geleni ekle' },
            ].map(({ icon: Icon, t }) => (
              <li key={t} className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 sm:flex-col sm:items-start sm:py-4">
                <Icon className="size-5 shrink-0 text-copper" aria-hidden="true" />
                <span className="text-[0.95rem] text-cream">{t}</span>
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
  { q: 'Müşterimin uygulama indirmesi gerekir mi?', a: 'Hayır. Bağlantıya tıklar, telefonuna gelen kodla randevusunu alır.' },
  { q: 'Kurulum ne kadar sürer?', a: 'Kaydolun, onaylayalım; hizmet ve saatlerinizi girdiğiniz gün bağlantınızı paylaşabilirsiniz.' },
  { q: 'Birden fazla berberle çalışabilir miyim?', a: 'Evet. Her berberin kendi hizmetleri ve saatleri olur; personel yalnızca kendi randevularını görür.' },
  { q: 'Fiyat nedir?', a: 'İlk 14 gün ücretsiz. Sonrası için başvurunuzda size özel fiyatı konuşalım.' },
  { q: 'Mevcut müşterilerimi taşıyabilir miyim?', a: 'Evet, taşımanıza biz yardımcı oluruz.' },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="sss" className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-12 md:py-28">
      <Rv className="md:col-span-4">
        <p className="eyebrow">Sık sorulanlar</p>
        <h2 className="mt-4 font-display text-4xl font-light leading-[1.08] md:text-5xl">
          Kısa <span className="italic text-copper-bright">cevaplar.</span>
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
  const msg = encodeURIComponent('Merhaba, BehTech Randevu hakkında bilgi almak istiyorum.')
  return (
    <section id="baslayin" className="relative overflow-hidden border-t border-line bg-surface">
      <Pole className="absolute inset-x-0 top-0 h-1.5 opacity-80" />
      <div className="mx-auto max-w-6xl px-5 py-20 text-center md:py-28">
        <Rv>
          <h2 className="mx-auto max-w-3xl font-display text-5xl font-light leading-[1.04] tracking-tight md:text-7xl">
            <span className="italic text-copper-bright">14 gün</span> ücretsiz deneyin.
          </h2>
        </Rv>
        <Rv delay={120} className="mt-10 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          <Link to="/kayit" className={btnPrimary}>
            Ücretsiz dene
          </Link>
          <a href={DEMO_SITE_URL} target="_blank" rel="noopener noreferrer" className={btnGhost}>
            Canlı demoyu gör <ArrowUpRight size={18} aria-hidden />
          </a>
          {wa && (
            <a href={`https://wa.me/${wa}?text=${msg}`} target="_blank" rel="noopener noreferrer" className={btnGhost}>
              WhatsApp ile yazın
            </a>
          )}
        </Rv>
      </div>
    </section>
  )
}

/** İletişim kanalları: kısa, ikonlu kartlar. Boş kanal gösterilmez. */
function ContactChannels() {
  const email = CONTACT.email.trim()
  const ig = CONTACT.instagram.trim()
  const wa = CONTACT.whatsapp.replace(/\D/g, '')
  const items = [
    email && { href: `mailto:${email}`, icon: <Mail className="size-6" aria-hidden="true" />, label: 'E-posta', value: email, external: false },
    ig && { href: ig, icon: <InstagramIcon className="size-6" aria-hidden="true" />, label: 'Instagram', value: instagramHandle(ig), external: true },
    wa && { href: `https://wa.me/${wa}`, icon: <MessageCircle className="size-6" aria-hidden="true" />, label: 'WhatsApp', value: 'Mesaj yazın', external: true },
  ].filter(Boolean) as { href: string; icon: ReactNode; label: string; value: string; external: boolean }[]
  if (items.length === 0) return null
  return (
    <section id="iletisim" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 text-center md:py-24">
        <Rv>
          <p className="eyebrow">İletişim</p>
          <h2 className="mt-4 font-display text-4xl font-light leading-[1.08] md:text-5xl">
            Bize <span className="italic text-copper-bright">ulaşın.</span>
          </h2>
        </Rv>
        {/* Kartlar eşit genişlikte ve ortalı: 2 kanalda iki sütun, 3 kanalda üç sütun (mobilde tek sütun). */}
        <ul className={`mx-auto mt-10 grid gap-4 sm:grid-cols-2 ${items.length >= 3 ? 'max-w-5xl lg:grid-cols-3' : 'max-w-3xl'}`}>
          {items.map((c, i) => (
            <Rv as="li" key={c.label} delay={i * 80}>
              <a
                href={c.href}
                {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="group flex h-full flex-col items-center gap-4 rounded-lg border border-line bg-surface px-6 py-8 text-center transition-colors hover:border-copper"
              >
                <span className="flex size-14 items-center justify-center rounded-full border border-copper/40 bg-copper/10 text-copper-bright">
                  {c.icon}
                </span>
                <span className="min-w-0 max-w-full">
                  <span className="block text-xs uppercase tracking-[0.16em] text-muted">{c.label}</span>
                  <span className="mt-1 block break-words font-display text-xl text-cream transition-colors group-hover:text-copper-bright md:text-2xl">{c.value}</span>
                </span>
              </a>
            </Rv>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line pb-safe">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 py-8 text-center text-sm text-muted">
        <nav aria-label="İletişim" className="flex items-center justify-center gap-1">
          <a href="#iletisim" className="mr-2 inline-flex min-h-11 items-center hover:text-cream">
            İletişim
          </a>
          {CONTACT.email && (
            <a href={`mailto:${CONTACT.email}`} aria-label={`E-posta: ${CONTACT.email}`} title={CONTACT.email} className="inline-flex size-11 items-center justify-center rounded-full hover:text-cream">
              <Mail className="size-[18px]" aria-hidden="true" />
            </a>
          )}
          {CONTACT.instagram && (
            <a href={CONTACT.instagram} target="_blank" rel="noopener noreferrer" aria-label={`Instagram: ${instagramHandle(CONTACT.instagram)}`} title={instagramHandle(CONTACT.instagram)} className="inline-flex size-11 items-center justify-center rounded-full hover:text-cream">
              <InstagramIcon className="size-[18px]" aria-hidden="true" />
            </a>
          )}
        </nav>
        <nav aria-label="Yasal" className="flex flex-wrap justify-center gap-x-5">
          {[
            ['gizlilik', 'Gizlilik'],
            ['sartlar', 'Kullanım Şartları'],
            ['veri-isleme', 'Veri İşleme Sözleşmesi'],
            ['aydinlatma', 'Aydınlatma'],
          ].map(([slug, label]) => (
            <LegalLink key={slug} slug={slug as LegalSlug} className="inline-flex min-h-11 items-center hover:text-cream">
              {label}
            </LegalLink>
          ))}
        </nav>
        <BrandCredit className="mt-1" />
      </div>
    </footer>
  )
}

export default function ProductPage() {
  useRevealRoot()
  useEffect(() => startSiteStats(DEMO_SITE_URL), [])
  useEffect(() => {
    const prev = document.title
    document.title = `${PRODUCT_NAME} · Berber ve kuaförler için online randevu`
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
        <BeforeAfter />
        <Features />
        <WhatsappBand />
        <HowItWorks />
        <Mobile />
        <Faq />
        <Contact />
        <ContactChannels />
      </main>
      <Footer />
    </div>
  )
}
