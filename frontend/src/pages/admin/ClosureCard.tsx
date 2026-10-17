// "Bugün kapalıyım": tek dokunuşla bugünü tüm personel için kapatır (aniden kapanma günleri için). Yalnızca yönetici/sahip.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DoorClosed } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import { todayLocalISO } from '../../lib/format'
import { qk } from './shared'

export function ClosureCard() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const today = todayLocalISO()
  const key = ['admin', 'closure', today] as const
  const [confirming, setConfirming] = useState(false)

  const q = useQuery({ queryKey: key, queryFn: () => adminApi.getClosure(today), retry: false })

  function refresh(data: Awaited<ReturnType<typeof adminApi.getClosure>>) {
    queryClient.setQueryData(key, data)
    void queryClient.invalidateQueries({ queryKey: qk.dashboard })
    void queryClient.invalidateQueries({ queryKey: qk.appointments })
    void queryClient.invalidateQueries({ queryKey: ['availability'] })
  }
  const close = useMutation({
    mutationFn: () => adminApi.closeDay(today),
    onSuccess: (d) => {
      refresh(d)
      setConfirming(false)
      toast.success('Bugün kapalı olarak işaretlendi')
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setConfirming(false)
    },
  })
  const reopen = useMutation({
    mutationFn: () => adminApi.reopenDay(today),
    onSuccess: (d) => {
      refresh(d)
      toast.success('Bugün yeniden açıldı')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const s = q.data
  if (!s) return null // yüklenirken ya da hata varsa sessizce gizle (ana akışı bozmasın)

  if (s.closed) {
    return (
      <div role="status" className="mb-6 flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <DoorClosed className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-cream">Bugün kapalı olarak işaretlendi</p>
            <p className="mt-0.5 text-muted-strong">
              Müşteriler bugüne randevu alamaz.
              {s.confirmed_appointments > 0 && ` Bugün için ${s.confirmed_appointments} onaylı randevu var; bunları müşterilerle sizin düzenlemeniz gerekir.`}
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => reopen.mutate()} loading={reopen.isPending} className="sm:shrink-0">
          Tekrar aç
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="mb-6">
        <Button variant="secondary" onClick={() => setConfirming(true)} leftIcon={<DoorClosed className="size-4" />}>
          Bugün kapalıyım
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => !close.isPending && setConfirming(false)}
        onConfirm={() => close.mutate()}
        title="Bugün kapalı olsun mu?"
        description={
          s.confirmed_appointments > 0
            ? `Bugün için ${s.confirmed_appointments} onaylı randevu var. Bu randevular iptal edilmez; müşterilerle sizin ilgilenmeniz gerekir. Yeni randevu alınamaz.`
            : 'Bugün yeni randevu alınamaz. İsterseniz istediğiniz an "Tekrar aç" diyebilirsiniz.'
        }
        confirmLabel="Bugünü kapat"
        cancelLabel="Vazgeç"
        destructive
        loading={close.isPending}
      />
    </>
  )
}
