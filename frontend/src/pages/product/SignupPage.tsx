import { useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Checkbox } from '../../components/ui/Checkbox'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PasswordHints } from '../../components/ui/PasswordHints'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Spinner } from '../../components/ui/Spinner'
import { errorMessage, publicApi } from '../../lib/api'
import { isValidPhone, normalizePhone } from '../../lib/format'
import { PRODUCT_NAME, useDocumentTitle } from '../../lib/head'
import { passwordValid } from '../../lib/passwordPolicy'
import { BASE_DOMAIN } from '../../lib/site'
import './product.css'

const RESERVED = ['www', 'api', 'admin', 'platform', 'app', 'mail', 'saleshub', 'panel', 'static', 'randevu']
const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/** "Usta Makas Berber" -> "usta-makas-berber": Türkçe karakterleri sadeleştirir. */
function slugify(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function cleanSlug(v: string): string {
  return v
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_MAP[c] ?? c)
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40)
}

function slugError(slug: string): string | null {
  if (!slug) return 'İşletme adresi gerekli.'
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || slug.startsWith('-') || slug.endsWith('-'))
    return '3-40 karakter; küçük harf, rakam ve tire. Tire ile başlayıp bitemez.'
  if (RESERVED.includes(slug)) return 'Bu adres kullanılamaz, başka bir tane seçin.'
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const LINK_CLS = 'text-copper-bright underline underline-offset-4'

export default function SignupPage() {
  useDocumentTitle('Ücretsiz dene', PRODUCT_NAME)
  const [form, setForm] = useState({ name: '', slug: '', owner_name: '', owner_surname: '', owner_phone: '', email: '', password: '' })
  const [slugTouched, setSlugTouched] = useState(false)
  const [terms, setTerms] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [doneSlug, setDoneSlug] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const errors = {
    name: form.name.trim().length >= 2 ? null : 'İşletme adını girin.',
    slug: slugError(form.slug),
    owner_name: form.owner_name.trim() ? null : 'Adınızı girin.',
    owner_surname: form.owner_surname.trim() ? null : 'Soyadınızı girin.',
    owner_phone: isValidPhone(form.owner_phone) ? null : 'Geçerli bir cep telefonu girin (5XXXXXXXXX).',
    email: !form.email.trim() || EMAIL_RE.test(form.email.trim()) ? null : 'Geçerli bir e-posta girin.',
    password: passwordValid(form.password, form.owner_phone) ? null : 'Şifre kurallarını sağlayın.',
    terms: terms ? null : 'Devam etmek için şartları kabul etmelisiniz.',
  }
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : null)

  const signup = useMutation({
    mutationFn: publicApi.signup,
    onSuccess: (r) => setDoneSlug(r.slug),
    onError: (err) => setServerError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (Object.values(errors).some(Boolean)) return
    signup.mutate({
      name: form.name.trim(),
      slug: form.slug,
      owner_name: form.owner_name.trim(),
      owner_surname: form.owner_surname.trim(),
      owner_phone: normalizePhone(form.owner_phone),
      password: form.password,
      email: form.email.trim() || undefined,
      accept_terms: true,
    })
  }

  return (
    <div className="pb-safe min-h-svh bg-ink text-cream">
      <header className="pt-header border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="font-display text-lg tracking-tight text-cream">
            BehTech <span className="italic text-copper-bright">Randevu</span>
          </Link>
          <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted-strong hover:text-cream">
            Ana sayfa
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-10 md:py-16">
        {doneSlug ? (
          <div className="text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full border border-line-strong text-copper-bright">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
            <h1 className="mt-6 font-display text-4xl font-light leading-tight md:text-5xl">
              Başvurunuz <span className="italic text-copper-bright">alındı.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted-strong">
              Başvurunuzu inceleyip size dönüş yapacağız. Onaylandığında{' '}
              <span className="break-all text-cream">
                {doneSlug}.{BASE_DOMAIN}
              </span>{' '}
              adresindeki panele telefon numaranız ve belirlediğiniz şifreyle giriş yapabilirsiniz; 14 günlük deneme de o zaman başlar.
            </p>
            <Link
              to="/"
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-sm border border-line-strong px-6 text-[0.95rem] font-semibold text-cream transition-colors hover:border-copper hover:text-copper-bright"
            >
              Ana sayfaya dön
            </Link>
          </div>
        ) : (
          <>
            <p className="eyebrow">Ücretsiz dene</p>
            <h1 className="mt-4 font-display text-4xl font-light leading-[1.08] tracking-tight md:text-6xl">
              Dükkânınızı <span className="italic text-copper-bright">birlikte açalım.</span>
            </h1>
            <p className="mt-5 max-w-lg leading-relaxed text-muted-strong">
              Bilgilerinizi bırakın; başvurunuzu inceleyip hesabınızı açalım. Onaydan sonra 14 gün ücretsiz deneyebilirsiniz.
            </p>

            <form onSubmit={submit} noValidate className="mt-10 space-y-5">
              <Field label="İşletme adı" required error={show('name')}>
                <Input
                  autoComplete="organization"
                  value={form.name}
                  maxLength={80}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => ({ ...f, name: v, slug: slugTouched ? f.slug : slugify(v) }))
                  }}
                />
              </Field>
              <Field
                label="İşletme adresi"
                required
                error={show('slug')}
                hint={
                  <>
                    Müşterileriniz şu adresten randevu alır:{' '}
                    <span className="break-all text-cream">
                      {form.slug || 'adresiniz'}.{BASE_DOMAIN}
                    </span>
                  </>
                }
              >
                <Input
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    set('slug')(cleanSlug(e.target.value))
                  }}
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Adınız" required error={show('owner_name')}>
                  <Input autoComplete="given-name" autoCapitalize="words" value={form.owner_name} maxLength={60} onChange={(e) => set('owner_name')(e.target.value)} />
                </Field>
                <Field label="Soyadınız" required error={show('owner_surname')}>
                  <Input autoComplete="family-name" autoCapitalize="words" value={form.owner_surname} maxLength={60} onChange={(e) => set('owner_surname')(e.target.value)} />
                </Field>
              </div>
              <Field label="Cep telefonu" required error={show('owner_phone')} hint="Panele bu numarayla giriş yapacaksınız.">
                <PhoneInput autoComplete="tel" value={form.owner_phone} onValueChange={set('owner_phone')} />
              </Field>
              <Field label="E-posta (isteğe bağlı)" error={show('email')}>
                <Input type="email" autoComplete="email" autoCapitalize="none" value={form.email} onChange={(e) => set('email')(e.target.value)} />
              </Field>
              <Field label="Şifre" required error={show('password')}>
                <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password')(e.target.value)} />
              </Field>
              <PasswordHints password={form.password} phone={form.owner_phone} />

              <div>
                <Checkbox
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  aria-invalid={show('terms') ? true : undefined}
                  label={
                    <>
                      <a href="/yasal/sartlar" target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
                        Kullanım Şartları
                      </a>
                      'nı ve{' '}
                      <a href="/yasal/veri-isleme" target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
                        Veri İşleme Sözleşmesi
                      </a>
                      'ni okudum, kabul ediyorum.
                    </>
                  }
                />
                {show('terms') && (
                  <p role="alert" className="mt-1 text-sm text-danger">
                    {errors.terms}
                  </p>
                )}
              </div>

              {serverError && (
                <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={signup.isPending}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-sm bg-copper px-6 text-[0.95rem] font-semibold text-ink transition-colors hover:bg-copper-bright disabled:opacity-60"
              >
                {signup.isPending && <Spinner size="sm" className="text-current" />}
                Başvuruyu gönder
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
