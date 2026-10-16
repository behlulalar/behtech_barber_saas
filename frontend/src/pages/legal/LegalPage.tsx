import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ThemeToggle } from '../../lib/theme'
import { LegalContent } from '../../components/LegalModal'
import { LEGAL_DOCS, type LegalSlug } from '../../lib/legal'
import { PRODUCT_NAME, useDocumentTitle } from '../../lib/head'
import NotFoundPage from '../NotFoundPage'

/** Yasal metinler (aydınlatma, gizlilik, şartlar, veri işleme). Tanıtım sitesinde ve dükkân sitesinde aynı sayfa. */
export default function LegalPage() {
  const { slug } = useParams()
  const doc = slug && Object.prototype.hasOwnProperty.call(LEGAL_DOCS, slug) ? LEGAL_DOCS[slug as LegalSlug] : null
  useDocumentTitle(doc?.title, PRODUCT_NAME)
  if (!doc) return <NotFoundPage />

  return (
    <div className="pt-safe pb-safe min-h-svh bg-ink text-cream">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 md:px-10 md:py-14">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-strong hover:text-cream">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Ana sayfaya dön
          </Link>
          <ThemeToggle className="-mr-2" />
        </div>

        <article className="mt-4">
          <p className="eyebrow">Yasal</p>
          <h1 className="mt-3 break-words font-display text-[2rem] font-medium leading-tight md:text-5xl">{doc.title}</h1>
          <p className="mt-3 text-sm text-muted">Son güncelleme: {doc.updated}</p>

          <div className="mt-10">
            <LegalContent doc={doc} />
          </div>
        </article>
      </div>
    </div>
  )
}
