// Kayıt başvurusu onay kartı (işletme detay sayfası). Metinler liste sayfasındaki onay diyaloglarıyla aynı.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, UserCheck, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import type { PlatformTenant } from '../../types/api'

export function SignupReviewCard({ tenant }: { tenant: PlatformTenant }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)

  const review = useMutation({
    mutationFn: (a: 'approve' | 'reject') => (a === 'approve' ? platformApi.approveSignup(tenant.id) : platformApi.rejectSignup(tenant.id)),
    onSuccess: (t, a) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success(a === 'approve' ? `${t.name} onaylandı, 14 günlük deneme başladı` : `${t.name} başvurusu reddedildi`)
      setAction(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setAction(null)
    },
  })

  return (
    <>
      <section role="status" className="mb-6 flex flex-col gap-4 rounded-md border border-copper/50 bg-copper/10 p-4 md:mb-8 md:flex-row md:items-center md:justify-between md:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <UserCheck className="mt-0.5 size-5 shrink-0 text-copper-bright" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium text-cream">Kayıt başvurusu onay bekliyor</p>
            <p className="mt-1 text-sm text-muted-strong">Onaylarsanız işletme aktifleşir ve 14 günlük deneme başlar. Reddederseniz işletme pasif kalır.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" leftIcon={<XCircle className="size-4" />} onClick={() => setAction('reject')}>
            Reddet
          </Button>
          <Button leftIcon={<CheckCircle2 className="size-4" />} onClick={() => setAction('approve')}>
            Onayla
          </Button>
        </div>
      </section>
      <ConfirmDialog
        open={!!action}
        onClose={() => setAction(null)}
        onConfirm={() => action && review.mutate(action)}
        destructive={action === 'reject'}
        loading={review.isPending}
        title={action === 'approve' ? 'Başvuru onaylansın mı?' : 'Başvuru reddedilsin mi?'}
        confirmLabel={action === 'approve' ? 'Onayla' : 'Reddet'}
        description={
          action === 'approve' ? (
            <>
              <strong className="text-cream">{tenant.name}</strong> aktifleştirilir ve 14 günlük deneme başlar.
            </>
          ) : (
            <>
              <strong className="text-cream">{tenant.name}</strong> başvurusu reddedilir; işletme pasif kalır.
            </>
          )
        }
      />
    </>
  )
}
