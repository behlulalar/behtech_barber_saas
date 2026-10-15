// Denetim kaydı: `details` alanını okunur anahtar-değer listesine çevirir.
import { Bot, Shield, User } from 'lucide-react'
import { formatDateDMY } from './billing'

const KEY_LABELS: Record<string, string> = {
  fields: 'Değişen alanlar',
  changed: 'Değişen alanlar',
  changed_fields: 'Değişen alanlar',
  name: 'Ad',
  old_name: 'Eski ad',
  new_name: 'Yeni ad',
  phone: 'Telefon',
  slug: 'Adres',
  is_active: 'Aktif',
  active: 'Aktif',
  amount: 'Tutar',
  price: 'Fiyat',
  method: 'Yöntem',
  note: 'Not',
  paid_on: 'Ödeme tarihi',
  start_date: 'Başlangıç',
  end_date: 'Bitiş',
  plan: 'Paket',
  plan_id: 'Paket no',
  plan_name: 'Paket',
  tenant: 'İşletme',
  tenant_id: 'İşletme no',
  tenant_name: 'İşletme',
  subscription_id: 'Dönem no',
  payment_id: 'Ödeme no',
  admin_id: 'Yönetici no',
  reason: 'Neden',
  checked: 'Kontrol edilen',
  notified: 'Bildirilen',
  suspended: 'Askıya alınan',
  reactivated: 'Yeniden açılan',
  email_sent: 'E-posta gönderildi',
  push_sent: 'Bildirim gönderilen cihaz',
  trigger: 'Tetikleyen',
  ip: 'IP',
  balance: 'Bakiye',
  status: 'Durum',
  days: 'Gün',
  days_overdue: 'Geciken gün',
  attempts: 'Deneme',
  templates: 'Şablonlar',
}

const BOOL = (v: boolean) => (v ? 'Evet' : 'Hayır')
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function humanizeKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key]
  const s = key.replace(/_/g, ' ').trim()
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1)
}

function humanizeValue(v: unknown): { text: string; mono: boolean } {
  if (v === null || v === undefined) return { text: '—', mono: false }
  if (typeof v === 'boolean') return { text: BOOL(v), mono: false }
  if (typeof v === 'number') return { text: String(v), mono: false }
  if (typeof v === 'string') return { text: ISO_DATE.test(v) ? formatDateDMY(v) : v || '—', mono: false }
  if (Array.isArray(v) && v.every((x) => ['string', 'number', 'boolean'].includes(typeof x))) {
    return { text: v.length ? v.map((x) => (typeof x === 'boolean' ? BOOL(x) : String(x))).join(', ') : '—', mono: false }
  }
  return { text: JSON.stringify(v, null, 2), mono: true }
}

export function AuditDetails({ details }: { details: Record<string, unknown> | null }) {
  const entries = details ? Object.entries(details) : []
  if (entries.length === 0) return <p className="text-sm text-muted">Bu kayıt için ek ayrıntı yok.</p>
  return (
    <dl className="flex flex-col divide-y divide-panel-line rounded-md border border-panel-line">
      {entries.map(([k, v]) => {
        const { text, mono } = humanizeValue(v)
        return (
          <div key={k} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="text-xs uppercase tracking-[0.08em] text-muted">{humanizeKey(k)}</dt>
            <dd className={mono ? 'min-w-0 whitespace-pre-wrap break-all font-mono text-xs text-cream' : 'min-w-0 break-words text-sm text-cream'}>{text}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export function ActorLabel({ type, label }: { type: string; label: string }) {
  const Icon = type === 'system' ? Bot : type === 'platform_admin' ? Shield : User
  const typeText = type === 'system' ? 'Sistem' : type === 'platform_admin' ? 'Yönetici' : 'Personel'
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 break-words">{label || typeText}</span>
      <span className="sr-only"> ({typeText})</span>
    </span>
  )
}
