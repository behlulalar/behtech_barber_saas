// Platform: işletme verisi (KVKK) — dışa aktar (ZIP) ve KALICI sil. Silme yalnızca pasif işletmede, alt alan adı yazılarak.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { downloadFile, errorMessage, platformApi } from '../../lib/api'
import type { PlatformTenantDetail } from '../../types/api'

export function DataCard({ tenant }: { tenant: PlatformTenantDetail }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const erased = tenant.slug.startsWith('silinmis-')

  async function download() {
    setBusy(true)
    try {
      await downloadFile(`/platform/tenants/${tenant.id}/export`, 'platform', `${tenant.slug}-veri.zip`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const erase = useMutation({
    mutationFn: () => platformApi.eraseTenant(tenant.id, typed.trim()),
    onSuccess: () => {
      toast.success('İşletmenin kişisel verisi silindi')
      setConfirming(false)
      setTyped('')
      void qc.invalidateQueries({ queryKey: ['platform'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Card>
      <CardHeader title="Veriler (KVKK)" description="İşletmenin kişisel verisini dışa aktarın ya da kalıcı silin." />
      {erased ? (
        <p className="text-sm text-muted-strong">Bu işletmenin kişisel verisi silinmiş. Yalnızca muhasebe kaydı (abonelik ve ödemeler) tutuluyor.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <Button variant="secondary" onClick={() => void download()} loading={busy} leftIcon={<Download className="size-4" />}>
              Verileri indir (ZIP)
            </Button>
            <p className="mt-1.5 text-xs text-muted">Müşteriler, randevular, personel, hizmetler, onay kayıtları, abonelik ve ödemeler. Şifre ve görsel içermez.</p>
          </div>
          <div className="border-t border-panel-line pt-4">
            <Button variant="danger" onClick={() => setConfirming(true)} disabled={tenant.is_active} leftIcon={<Trash2 className="size-4" />}>
              Verileri kalıcı sil
            </Button>
            <p className="mt-1.5 text-xs text-muted">
              {tenant.is_active ? 'Silmeden önce işletmeyi pasife alın ve verileri indirin.' : 'Geri alınamaz. Önce verileri indirmeniz önerilir.'}
            </p>
          </div>
        </div>
      )}

      <Modal
        open={confirming}
        onClose={() => !erase.isPending && setConfirming(false)}
        dismissible={!erase.isPending}
        size="sm"
        title="Veriler kalıcı silinsin mi?"
        description="Müşteriler, randevular, personel, hizmetler, görseller, bildirimler ve WhatsApp bağlantısı SİLİNİR. Abonelik ve ödeme kayıtları (muhasebe) saklanır. Bu işlem geri alınamaz."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={erase.isPending}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={() => erase.mutate()} loading={erase.isPending} disabled={typed.trim().toLowerCase() !== tenant.slug}>
              Kalıcı olarak sil
            </Button>
          </>
        }
      >
        <div className="pb-2">
          <Field label={`Onaylamak için alt alan adını yazın: ${tenant.slug}`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />
          </Field>
        </div>
      </Modal>
    </Card>
  )
}
