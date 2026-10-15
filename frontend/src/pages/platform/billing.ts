// Ödeme takibi için saf yardımcılar: şablon üretimi, IBAN/WhatsApp biçimleri, durum etiketleri.
import { formatPrice, normalizePhone } from '../../lib/format'
import type { BillingStatus, PlatformSettings, Subscription, TenantBilling } from '../../types/api'
import type { BadgeTone } from '../../components/ui/Badge'

export const TEMPLATE_VARS = [
  { key: 'isletme', label: 'İşletme', sample: 'Demo Berber' },
  { key: 'sahip', label: 'Sahip', sample: 'Ahmet' },
  { key: 'paket', label: 'Paket', sample: 'Yıllık' },
  { key: 'tutar', label: 'Tutar', sample: '12.000 ₺' },
  { key: 'kalan_tutar', label: 'Kalan tutar', sample: '6.000 ₺' },
  { key: 'bitis', label: 'Bitiş', sample: '14.10.2026' },
  { key: 'kalan_gun', label: 'Kalan gün', sample: '3' },
  { key: 'iban', label: 'IBAN', sample: 'TR12 3456 7890 1234 5678 9012 34' },
  { key: 'alici', label: 'Alıcı', sample: 'Muhammed Behlül Alar' },
  { key: 'banka', label: 'Banka', sample: 'Ziraat Bankası' },
] as const

export type TemplateVars = Record<(typeof TEMPLATE_VARS)[number]['key'], string>

export const SAMPLE_VARS = Object.fromEntries(TEMPLATE_VARS.map((v) => [v.key, v.sample])) as TemplateVars

/** "{isletme}" gibi yer tutucuları doldurur; bilinmeyenleri olduğu gibi bırakır. */
export function renderTemplate(tpl: string, vars: Partial<Record<string, string>>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)
}

/** "2026-10-14" -> "14.10.2026" */
export function formatDateDMY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

/** "TR120006..." -> "TR12 0006 ..." */
export function formatIban(iban: string | null | undefined): string {
  if (!iban) return ''
  return iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim()
}

export function periodLabel(s: Pick<Subscription, 'plan_name' | 'start_date' | 'end_date'>): string {
  return `${s.plan_name} · ${formatDateDMY(s.start_date)}–${formatDateDMY(s.end_date)}`
}

export function templateVars(tb: TenantBilling, settings: PlatformSettings | undefined): TemplateVars {
  const sub = tb.next ?? tb.current
  // Yeni dönem henüz açılmadıysa mesajdaki paket/tutar yenileme bilgisidir (süresi dolmuş ama
  // son dönemini ödemiş işletmede bakiye 0'dır; mesajda "0 ₺" yazmamalı).
  return {
    isletme: tb.tenant_name,
    sahip: tb.owner_name ?? '',
    paket: tb.next?.plan_name ?? tb.renewal_plan_name ?? sub?.plan_name ?? 'abonelik',
    tutar: formatPrice(tb.next?.price ?? tb.renewal_price ?? sub?.price ?? tb.amount_due),
    kalan_tutar: formatPrice(tb.amount_due),
    bitis: tb.coverage_end ? formatDateDMY(tb.coverage_end) : '',
    kalan_gun: String(Math.max(tb.days_left ?? 0, 0)),
    iban: formatIban(settings?.iban),
    alici: settings?.account_holder ?? '',
    banka: settings?.bank_name ?? '',
  }
}

export function isOverdue(status: BillingStatus): boolean {
  return status === 'grace' || status === 'expired'
}

/** Deneme dönemindeki işletme (devam etmek istiyor mu mesajı) */
export function isTrialTenant(tb: Pick<TenantBilling, 'status' | 'is_trial'>): boolean {
  return tb.is_trial && (tb.status === 'trial' || tb.status === 'expired')
}

export function whatsappMessage(tb: TenantBilling, settings: PlatformSettings): string {
  const tpl = isTrialTenant(tb)
    ? settings.trial_template
    : isOverdue(tb.status)
      ? settings.overdue_template
      : settings.reminder_template
  return renderTemplate(tpl, templateVars(tb, settings))
}

/** Sahip telefonu yoksa null. */
export function whatsappUrl(tb: TenantBilling, settings: PlatformSettings): string | null {
  const phone = normalizePhone(tb.owner_phone ?? '')
  if (phone.length !== 10) return null
  return `https://wa.me/90${phone}?text=${encodeURIComponent(whatsappMessage(tb, settings))}`
}

export const STATUS_TONES: Record<BillingStatus, BadgeTone> = {
  expired: 'danger',
  grace: 'warning',
  due_soon: 'copper',
  trial: 'info',
  active: 'success',
  scheduled: 'info',
  untracked: 'neutral',
}

export const STATUS_ORDER: Record<BillingStatus, number> = {
  expired: 0,
  grace: 1,
  due_soon: 2,
  trial: 3,
  active: 4,
  scheduled: 5,
  untracked: 6,
}

export function statusLabel(
  tb: Pick<TenantBilling, 'status' | 'days_left' | 'auto_suspended_at'> & { is_trial?: boolean },
  graceDays?: number,
): string {
  switch (tb.status) {
    case 'trial':
      return tb.days_left === 0 ? 'Deneme (bugün bitiyor)' : `Deneme (${tb.days_left} gün kaldı)`
    case 'expired':
      if (tb.is_trial) return 'Deneme bitti'
      return tb.auto_suspended_at ? 'Süresi doldu – askıya alındı' : 'Süresi doldu'
    case 'grace': {
      const left = graceDays !== undefined && tb.days_left !== null ? graceDays + tb.days_left : null
      return left !== null && left >= 0 ? `Ek süre (${left} gün)` : 'Ek süre'
    }
    case 'due_soon':
      return tb.days_left === 0 ? 'Bugün bitiyor' : `${tb.days_left} gün kaldı`
    case 'active':
      return 'Abonelik aktif'
    case 'scheduled':
      return 'Başlamadı'
    default:
      return 'Takip dışı'
  }
}

const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' })

/** ISO zaman damgası -> "2 saat önce" / "dün". */
export function formatRelative(ts: string, now: number = Date.now()): string {
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return ''
  const diffSec = Math.round((t - now) / 1000)
  const abs = Math.abs(diffSec)
  if (abs < 60) return 'az önce'
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  return rtf.format(Math.round(diffSec / 86400), 'day')
}

/** 0..1 oranı "%50" olarak; yoksa "—". */
export function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `%${Math.round(rate * 100)}`
}

/** Kullanıcı girdisini (örn. "1.500") tam sayıya çevirir; geçersizse null. */
export function parseAmount(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}
