import { MessageCircle, Phone } from 'lucide-react'
import type { SVGProps } from 'react'
import { cn } from '../lib/cn'
import { formatPhone } from '../lib/format'

/** lucide-react marka ikonlarını içermiyor; Instagram glifi (çizgi stilinde, diğer ikonlarla uyumlu). */
export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

export interface ContactInfo {
  contact_phone?: string | null
  whatsapp_phone?: string | null
  instagram?: string | null
}

export function hasContact(info: ContactInfo | undefined | null): boolean {
  return Boolean(info?.contact_phone || info?.whatsapp_phone || info?.instagram)
}

const telHref = (p: string) => `tel:+90${p}`
const waHref = (p: string) => `https://wa.me/90${p}`
const igHref = (u: string) => `https://www.instagram.com/${u}/`

/**
 * Dükkânın iletişim bağlantıları (panelden düzenlenir; boş olanlar gösterilmez).
 *  - `icons`: yuvarlak ikon düğmeleri (footer, dar alanlar)
 *  - `list`: ikon + metin satırları (ziyaret bölümü; numara görünür)
 */
export function ContactLinks({ info, variant = 'icons', className }: { info: ContactInfo | undefined | null; variant?: 'icons' | 'list'; className?: string }) {
  if (!hasContact(info)) return null
  const { contact_phone: phone, whatsapp_phone: wa, instagram: ig } = info!

  if (variant === 'list') {
    const row = 'inline-flex min-h-11 min-w-0 items-center gap-2.5 text-muted-strong transition-colors hover:text-cream'
    return (
      <ul className={cn('flex flex-col gap-0.5', className)}>
        {phone && (
          <li>
            <a href={telHref(phone)} className={row}>
              <Phone className="size-4 shrink-0 text-copper" aria-hidden="true" />
              <span className="tabular-nums">{formatPhone(phone)}</span>
            </a>
          </li>
        )}
        {wa && (
          <li>
            <a href={waHref(wa)} target="_blank" rel="noopener noreferrer" className={row}>
              <MessageCircle className="size-4 shrink-0 text-copper" aria-hidden="true" />
              <span>WhatsApp'tan yazın</span>
            </a>
          </li>
        )}
        {ig && (
          <li>
            <a href={igHref(ig)} target="_blank" rel="noopener noreferrer" className={row}>
              <InstagramIcon className="size-4 shrink-0 text-copper" />
              <span className="min-w-0 truncate">@{ig}</span>
            </a>
          </li>
        )}
      </ul>
    )
  }

  const btn =
    'inline-flex size-11 items-center justify-center rounded-full border border-line-strong text-muted-strong transition-colors hover:border-copper hover:text-copper-bright active:bg-copper/10'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {phone && (
        <a href={telHref(phone)} className={btn} aria-label={`Ara: ${formatPhone(phone)}`} title={formatPhone(phone)}>
          <Phone className="size-[18px]" aria-hidden="true" />
        </a>
      )}
      {wa && (
        <a href={waHref(wa)} target="_blank" rel="noopener noreferrer" className={btn} aria-label="WhatsApp'tan yazın" title="WhatsApp">
          <MessageCircle className="size-[18px]" aria-hidden="true" />
        </a>
      )}
      {ig && (
        <a href={igHref(ig)} target="_blank" rel="noopener noreferrer" className={btn} aria-label={`Instagram: @${ig}`} title={`@${ig}`}>
          <InstagramIcon className="size-[18px]" />
        </a>
      )}
    </div>
  )
}
