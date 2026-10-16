// Platform: işletmenin WhatsApp durumu, gönderim istatistikleri ve gönderimi durdur/aç.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Skeleton'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatNumber, formatPhone, whatsappReasonLabel } from '../../lib/format'
import type { PlatformWhatsapp } from '../../types/api'
import { formatDateTimeDMY } from './platformShared'

function statusBadge(w: PlatformWhatsapp): { tone: BadgeTone; label: string } {
  if (w.paused) return { tone: 'warning', label: 'Durduruldu' }
  if (w.state === 'open') return { tone: 'success', label: 'Bağlı' }
  if (w.state === 'connecting') return { tone: 'warning', label: 'Bağlanıyor' }
  if (w.disconnect_reason) return { tone: 'danger', label: 'Koptu' }
  return { tone: 'neutral', label: 'Bağlı değil' }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-cream">{children}</dd>
    </div>
  )
}

export function WhatsappTenantCard({ tenantId }: { tenantId: number }) {
  const qc = useQueryClient()
  const toast = useToast()
  const key = ['platform', 'tenant', tenantId, 'whatsapp'] as const
  const q = useQuery({ queryKey: key, queryFn: () => platformApi.getTenantWhatsapp(tenantId), retry: false })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reason, setReason] = useState('')

  const toggle = useMutation({
    mutationFn: (paused: boolean) => platformApi.setTenantWhatsappPaused(tenantId, paused, paused ? reason.trim() || undefined : undefined),
    onSuccess: (data) => {
      qc.setQueryData(key, data)
      void qc.invalidateQueries({ queryKey: ['platform', 'system'] })
      setConfirmOpen(false)
      setReason('')
      toast.success(data.paused ? 'Gönderim durduruldu' : 'Gönderim açıldı')
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setConfirmOpen(false)
    },
  })

  const w = q.data
  const badge = w ? statusBadge(w) : null
  const ratio = w && w.breaker_threshold > 0 ? w.unverified_last_hour / w.breaker_threshold : 0
  const unverifiedTone = !w ? '' : ratio >= 1 ? 'font-medium text-danger' : ratio >= 0.6 ? 'font-medium text-warning' : ''

  return (
    <Card>
      <CardHeader title="WhatsApp" description="İşletmenin kendi hattı ve gönderim durumu." action={badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : undefined} />
      {q.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-danger">{errorMessage(q.error)}</p>
          <Button variant="secondary" onClick={() => void q.refetch()}>Tekrar dene</Button>
        </div>
      ) : !w ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <dl className="divide-y divide-panel-line">
            <Row label="Numara">{w.phone ? <span className="tabular-nums">{formatPhone(w.phone.replace(/^90/, ''))}</span> : '—'}</Row>
            <Row label="Son 24 saat gönderilen">{formatNumber(w.sent_24h)}</Row>
            <Row label="Son 24 saat başarısız">
              <span className={w.failed_24h > 0 ? 'font-medium text-danger' : undefined}>{formatNumber(w.failed_24h)}</span>
            </Row>
            <Row label="Kuyrukta bekleyen">{formatNumber(w.queue_pending)}</Row>
            <Row label="Arka arkaya hata">
              <span className={w.consecutive_failures > 0 ? 'text-warning' : undefined}>{formatNumber(w.consecutive_failures)}</span>
            </Row>
            <Row label="Doğrulanmayan kod (son 1 saat)">
              <span className={unverifiedTone}>
                {formatNumber(w.unverified_last_hour)} / eşik {formatNumber(w.breaker_threshold)}
              </span>
            </Row>
            {w.disconnect_reason && w.state !== 'open' && (
              <Row label="Kopma nedeni">
                <span className="text-danger">
                  {whatsappReasonLabel(w.disconnect_reason)}
                  {w.disconnected_at ? ` · ${formatDateTimeDMY(w.disconnected_at)}` : ''}
                </span>
              </Row>
            )}
            {w.paused && w.paused_reason && <Row label="Durdurma nedeni">{w.paused_reason}</Row>}
          </dl>
          {w.abuse_alerted_at && <p className="mt-3 text-sm text-warning">Şüpheli trafik uyarısı: {formatDateTimeDMY(w.abuse_alerted_at)}</p>}
          {(w.paused || w.state === 'open') && (
            <div className="mt-4">
              {w.paused ? (
                <Button variant="secondary" onClick={() => toggle.mutate(false)} loading={toggle.isPending}>
                  Gönderimi aç
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                  Gönderimi durdur
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => toggle.mutate(true)}
        title="Gönderim durdurulsun mu?"
        confirmLabel="Durdur"
        destructive
        loading={toggle.isPending}
        description={
          <div className="flex flex-col gap-3">
            <p>Bu işletmenin WhatsApp mesajları gönderilmez; müşteriler doğrulama kodu alamaz.</p>
            <Field label="Neden (isteğe bağlı)">
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            </Field>
          </div>
        }
      />
    </Card>
  )
}
