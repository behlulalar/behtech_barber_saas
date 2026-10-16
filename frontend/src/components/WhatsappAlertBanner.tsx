import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { qk } from '../pages/admin/shared'
import { adminApi } from '../lib/api'
import { useStaffAuth } from '../lib/auth'
import { cn } from '../lib/cn'

/** İşletme sahibi/yöneticisi için kapatılamaz WhatsApp uyarı şeridi (kopma / durdurma). */
export function WhatsappAlertBanner() {
  const { isManager } = useStaffAuth()
  const q = useQuery({
    queryKey: qk.whatsapp,
    queryFn: adminApi.getWhatsapp,
    enabled: isManager,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  })
  const s = q.data
  if (!isManager || !s) return null
  const lost = !!s.disconnect_reason && s.state !== 'open'
  if (!lost && !s.paused) return null
  const blocked = s.disconnect_reason === 'forbidden' || s.disconnect_reason === 'logged_out'

  const box = (tone: 'danger' | 'warning') =>
    cn('flex items-start gap-3 rounded-md border px-4 py-3', tone === 'danger' ? 'border-danger/40 bg-danger/10 text-cream' : 'border-warning/40 bg-warning/10 text-cream')

  return (
    <section aria-label="WhatsApp uyarıları" className="mb-4 flex flex-col gap-2">
      {lost && (
        <div role="alert" className={box('danger')}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-words font-semibold">WhatsApp bağlantınız koptu — müşterileriniz doğrulama kodu alamıyor.</p>
            {blocked && <p className="mt-0.5 break-words text-muted-strong">Hesap engellenmiş ya da cihaz telefonunuzdan kaldırılmış olabilir.</p>}
            <Link to="/panel/ayarlar" className="mt-1 inline-flex min-h-11 items-center font-medium text-copper-bright hover:underline">
              Yeniden bağla
            </Link>
          </div>
        </div>
      )}
      {s.paused && (
        <div role="alert" className={box('warning')}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-words font-semibold">WhatsApp mesaj gönderimi durduruldu</p>
            <p className="mt-0.5 break-words text-muted-strong">
              {s.paused_reason ? `${s.paused_reason}. ` : ''}Destek için bizimle iletişime geçin.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
