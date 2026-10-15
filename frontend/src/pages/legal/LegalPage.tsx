import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { COMPANY, LEGAL_DOCS, type LegalSlug } from '../../lib/legal'
import { PRODUCT_NAME, useDocumentTitle } from '../../lib/head'
import NotFoundPage from '../NotFoundPage'

/** Yasal metinler (aydınlatma, gizlilik, şartlar, veri işleme). Tanıtım sitesinde ve dükkân sitesinde aynı sayfa. */
export default function LegalPage() {
  const { slug } = useParams()
  const doc = slug && Object.prototype.hasOwnProperty.call(LEGAL_DOCS, slug) ? LEGAL_DOCS[slug as LegalSlug] : null
  useDocumentTitle(doc?.title, PRODUCT_NAME)
  if (!doc) return <NotFoundPage />

  const company = [
    { label: 'Unvan', value: COMPANY.name },
    { label: 'Vergi no', value: COMPANY.taxNo },
    { label: 'Adres', value: COMPANY.address },
    { label: 'E-posta', value: COMPANY.email },
    { label: 'KVKK başvuru e-postası', value: COMPANY.kvkkEmail },
    { label: 'Telefon', value: COMPANY.phone },
  ].filter((r) => r.value && r.value.trim())

  return (
    <div className="pt-safe pb-safe min-h-svh bg-ink text-cream">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 md:px-10 md:py-14">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-strong hover:text-cream">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Ana sayfaya dön
        </Link>

        <article className="mt-4">
          <p className="eyebrow">Yasal</p>
          <h1 className="mt-3 break-words font-display text-[2rem] font-medium leading-tight md:text-5xl">{doc.title}</h1>
          <p className="mt-3 text-sm text-muted">Son güncelleme: {doc.updated}</p>

          <div className="mt-10 space-y-9">
            {doc.sections.map((s) => (
              <section key={s.heading}>
                <h2 className="font-display text-xl leading-snug text-cream md:text-2xl">{s.heading}</h2>
                <div className="mt-3 space-y-3">
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="break-words leading-relaxed text-muted-strong">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {company.length > 0 && (
            <section className="mt-12 border-t border-line pt-6">
              <h2 className="font-display text-xl text-cream">İletişim</h2>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
                {company.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="text-muted">{r.label}</dt>
                    <dd className="break-words text-cream">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </article>
      </div>
    </div>
  )
}
