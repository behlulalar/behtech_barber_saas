// Ödemeler sayfası ile işletme detayı arasında paylaşılan küçük bileşenler ve hook'lar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, MessageCircle } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatPrice } from '../../lib/format'
import type { PaymentStatus, PlatformSettingsOut, TenantBilling } from '../../types/api'
import { formatRelative, isTrialTenant, STATUS_TONES, statusLabel, whatsappUrl } from './billing'

export function useBillingSettings() {
  return useQuery({ queryKey: ['platform', 'settings'], queryFn: platformApi.getSettings })
}

/** Durum rozeti (Süresi doldu / Ek süre / N gün kaldı / ...). */
export function BillingStatusBadge({ tb, graceDays }: { tb: TenantBilling; graceDays?: number }) {
  return (
    <Badge tone={STATUS_TONES[tb.status]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {statusLabel(tb, graceDays)}
    </Badge>
  )
}

const PAY_LABELS: Record<PaymentStatus, string> = { paid: 'Ödendi', partial: 'Kısmi ödeme', unpaid: 'Ödenmemiş' }
const PAY_TONES = { paid: 'success', partial: 'warning', unpaid: 'danger' } as const

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAY_TONES[status]}>{PAY_LABELS[status]}</Badge>
}

/** Tutar: sağa yaslı, tabular. */
export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={`tabular-nums whitespace-nowrap ${className ?? ''}`}>{formatPrice(value)}</span>
}

/**
 * WhatsApp hatırlatma: yeni sekmede wa.me açar, sonra dönemi "hatırlatıldı" işaretler.
 * Dönem id'si TenantBilling'de olmadığından (geçmiş dönemler) gerekirse dönemler listesinden bulunur.
 */
export function useRemind(settings: PlatformSettingsOut | undefined) {
  const qc = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: async (tb: TenantBilling) => {
      let id = tb.current?.id
      if (!id) {
        const subs = await platformApi.listSubscriptions(tb.tenant_id)
        const latest = [...subs].sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
        id = latest?.id
      }
      if (id) await platformApi.markReminded(id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform'] }),
    onError: (err) => toast.error(errorMessage(err)),
  })

  function remind(tb: TenantBilling) {
    if (!settings) return
    const url = whatsappUrl(tb, settings)
    if (!url) {
      toast.error('İşletme sahibinin telefon numarası yok.')
      return
    }
    // Şablon IBAN/alıcı/banka kullanıyor ama ayarlarda boşsa mesaj "( , )" gibi bozuk gider.
    const tpl = `${settings.reminder_template} ${settings.overdue_template} ${settings.trial_template}`
    const missing = [
      tpl.includes('{iban}') && !settings.iban && 'IBAN',
      tpl.includes('{alici}') && !settings.account_holder && 'alıcı adı',
      tpl.includes('{banka}') && !settings.bank_name && 'banka',
    ].filter(Boolean)
    if (missing.length) {
      toast.error(`Mesajda ${missing.join(', ')} boş kalacak. Önce Platform → Ayarlar'dan ödeme bilgilerini girin.`)
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    mutation.mutate(tb)
  }
  return { remind, pending: mutation.isPending }
}

export function RemindButton({
  tb,
  settings,
  remind,
  size = 'sm',
  variant = 'secondary',
}: {
  tb: TenantBilling
  settings: PlatformSettingsOut | undefined
  remind: (tb: TenantBilling) => void
  size?: 'sm' | 'md'
  variant?: 'secondary' | 'primary'
}) {
  const noPhone = !tb.owner_phone
  return (
    <Button
      size={size}
      variant={variant}
      disabled={!settings || noPhone}
      title={noPhone ? 'Telefon numarası yok' : undefined}
      leftIcon={<MessageCircle className="size-4" />}
      onClick={() => remind(tb)}
    >
      {isTrialTenant(tb) ? 'Devam etmek istiyor mu?' : "WhatsApp'tan hatırlat"}
    </Button>
  )
}

export function RemindedNote({ at }: { at: string | null }) {
  if (!at) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <Check className="size-3.5" aria-hidden="true" />
      Hatırlatıldı · {formatRelative(at)}
    </span>
  )
}
