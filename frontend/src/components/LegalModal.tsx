import { useState, type ReactNode } from 'react'
import { COMPANY, LEGAL_DOCS, type LegalDoc, type LegalSlug } from '../lib/legal'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

/** Yasal metnin gövdesi: bölümler + (doluysa) şirket iletişim bilgileri. Sayfa ve modal ortak kullanır. */
export function LegalContent({ doc, headingLevel = 'h2' }: { doc: LegalDoc; headingLevel?: 'h2' | 'h3' }) {
  const H = headingLevel
  const company = [
    { label: 'Unvan', value: COMPANY.name },
    { label: 'Vergi no', value: COMPANY.taxNo },
    { label: 'Adres', value: COMPANY.address },
    { label: 'E-posta', value: COMPANY.email },
    { label: 'KVKK başvuru e-postası', value: COMPANY.kvkkEmail },
    { label: 'Telefon', value: COMPANY.phone },
  ].filter((r) => r.value && r.value.trim())

  return (
    <>
      <div className="space-y-8">
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <H className="font-display text-xl leading-snug text-cream md:text-2xl">{s.heading}</H>
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
        <section className="mt-10 border-t border-line pt-6">
          <H className="font-display text-xl text-cream">İletişim</H>
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
    </>
  )
}

/** Tıklayınca ilgili yasal metni modalda açan bağlantı (yeni sekme/sayfa yok; form ve onay kutusu durumu bozulmaz). */
export function LegalLink({ slug, className, children }: { slug: LegalSlug; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const doc = LEGAL_DOCS[slug]
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={className}
      >
        {children}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={doc.title}
        description={`Son güncelleme: ${doc.updated}`}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Kapat
          </Button>
        }
      >
        <LegalContent doc={doc} headingLevel="h3" />
      </Modal>
    </>
  )
}
