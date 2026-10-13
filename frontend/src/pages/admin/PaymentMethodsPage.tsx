import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import type { PaymentMethod } from '../../types/api'
import { ErrorBlock, qk, usePaymentMethodList } from './shared'

const PRESET_KEYS = ['IBAN', 'Hesap sahibi', 'Banka', 'Not']

function display(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export default function PaymentMethodsPage() {
  const { isManager } = useStaffAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const query = usePaymentMethodList()
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null)
  const [deleting, setDeleting] = useState<PaymentMethod | null>(null)

  const toggle = useMutation({
    mutationFn: (m: PaymentMethod) => adminApi.updatePaymentMethod(m.id, { is_active: !m.is_active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.paymentMethods }),
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: (m: PaymentMethod) => adminApi.deletePaymentMethod(m.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.paymentMethods })
      toast.success('Ödeme yöntemi silindi')
      setDeleting(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDeleting(null)
    },
  })

  const rows = query.data ?? []

  return (
    <>
      <PageHeader
        title="Ödeme Yöntemleri"
        description="Randevuyu tamamlarken seçilen ödeme türleri. IBAN gibi ek bilgileri de saklayabilirsiniz."
        actions={
          isManager && (
            <Button onClick={() => setEditing('new')} leftIcon={<Plus className="size-4" />}>
              Yeni yöntem
            </Button>
          )
        }
      />

      {query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2" role="status" aria-label="Yükleniyor">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-panel-line">
          <EmptyState
            icon={<Wallet />}
            title="Henüz ödeme yöntemi yok"
            description="Nakit, kart gibi yöntemleri ekleyin; tamamlama sırasında tek dokunuşla seçersiniz."
            action={
              isManager && (
                <Button onClick={() => setEditing('new')} leftIcon={<Plus className="size-4" />}>
                  Yöntem ekle
                </Button>
              )
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((m) => {
            const entries = Object.entries(m.details ?? {})
            return (
              <li key={m.id} className={cn('min-w-0 rounded-md border border-panel-line bg-panel p-4', !m.is_active && 'opacity-70')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-medium text-cream">{m.name}</h2>
                    {!isManager && <Badge tone={m.is_active ? 'success' : 'neutral'} className="mt-1.5">{m.is_active ? 'Aktif' : 'Pasif'}</Badge>}
                  </div>
                  {isManager && (
                    <div className="-mr-2 -mt-2 flex shrink-0">
                      <IconButton label={`${m.name} düzenle`} onClick={() => setEditing(m)}>
                        <Pencil className="size-[18px]" />
                      </IconButton>
                      <IconButton label={`${m.name} sil`} onClick={() => setDeleting(m)} className="hover:text-danger">
                        <Trash2 className="size-[18px]" />
                      </IconButton>
                    </div>
                  )}
                </div>
                {entries.length > 0 && (
                  <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                    {entries.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
                        <dt className="truncate text-muted">{k}</dt>
                        <dd className="break-all text-cream">{display(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {isManager && (
                  <div className="mt-3 border-t border-panel-line pt-1">
                    <Switch
                      checked={m.is_active}
                      disabled={toggle.isPending && toggle.variables?.id === m.id}
                      onChange={() => toggle.mutate(m)}
                      label={m.is_active ? 'Aktif' : 'Pasif'}
                      description={m.is_active ? undefined : 'Tamamlama ekranında gösterilmez'}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editing && <MethodForm key={editing === 'new' ? 'new' : editing.id} method={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        destructive
        title="Ödeme yöntemi silinsin mi?"
        description={
          <>
            <strong className="text-cream">{deleting?.name}</strong> silinecek. Geçmiş randevulardaki ödeme kaydı değişmez.
          </>
        }
        confirmLabel="Sil"
      />
    </>
  )
}

/* ------------------------------------------------------------------ */

interface DetailRow {
  id: number
  key: string
  value: string
  /** JSON'da string olmayan özgün değer; kullanıcı dokunmazsa aynen geri gönderilir. */
  orig?: unknown
}

let rowSeq = 0

function MethodForm({ method, onClose }: { method: PaymentMethod | null; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState(method?.name ?? '')
  const [active, setActive] = useState(method?.is_active ?? true)
  const [rows, setRows] = useState<DetailRow[]>(() =>
    Object.entries(method?.details ?? {}).map(([key, v]) => ({ id: ++rowSeq, key, value: display(v), orig: typeof v === 'string' ? undefined : v })),
  )
  const [touched, setTouched] = useState(false)

  const used = new Set(rows.map((r) => r.key.trim()).filter(Boolean))
  const dupKey = rows.find((r, i) => r.key.trim() && rows.findIndex((o) => o.key.trim() === r.key.trim()) !== i)

  function patch(id: number, p: Partial<DetailRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p, orig: undefined } : r)))
  }

  const save = useMutation({
    mutationFn: () => {
      const details: Record<string, unknown> = {}
      for (const r of rows) {
        const k = r.key.trim()
        if (!k) continue
        details[k] = r.orig !== undefined ? r.orig : r.value.trim()
      }
      const data = { name: name.trim(), is_active: active, details: Object.keys(details).length ? details : null }
      return method ? adminApi.updatePaymentMethod(method.id, data) : adminApi.createPaymentMethod(data)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.paymentMethods })
      toast.success(method ? 'Ödeme yöntemi güncellendi' : 'Ödeme yöntemi eklendi')
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function submit() {
    setTouched(true)
    if (!name.trim() || dupKey) return
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!save.isPending}
      title={method ? 'Ödeme yöntemini düzenle' : 'Yeni ödeme yöntemi'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {method ? 'Kaydet' : 'Ekle'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 pb-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Ad" required error={touched && !name.trim() ? 'Ad gerekli.' : null}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} placeholder="Örn. Havale / EFT" data-autofocus autoComplete="off" />
        </Field>

        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-[13px] font-medium tracking-wide text-muted-strong">Ek bilgiler</legend>
          <p className="mb-3 text-xs text-muted">İsteğe bağlı: IBAN, hesap sahibi gibi alan adı ve değer çiftleri.</p>
          {rows.length > 0 && (
            <ul className="mb-3 flex flex-col gap-3">
              {rows.map((r, i) => (
                <li key={r.id} className="flex items-start gap-2 rounded-md border border-line bg-surface p-3">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <Input aria-label={`Alan adı ${i + 1}`} placeholder="Alan adı" value={r.key} onChange={(e) => patch(r.id, { key: e.target.value, value: r.value })} />
                    <Input aria-label={`Değer ${i + 1}`} placeholder="Değer" value={r.value} onChange={(e) => patch(r.id, { value: e.target.value, key: r.key })} />
                  </div>
                  <IconButton label="Satırı kaldır" onClick={() => setRows((cur) => cur.filter((x) => x.id !== r.id))} className="-mr-1">
                    <X className="size-5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          {dupKey && (
            <p role="alert" className="mb-3 text-xs font-medium text-danger">
              “{dupKey.key.trim()}” alanı birden fazla kez girilmiş.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {PRESET_KEYS.filter((k) => !used.has(k)).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setRows((cur) => [...cur, { id: ++rowSeq, key: k, value: '' }])}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-sm text-muted-strong transition-colors hover:border-copper/60 hover:text-cream"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                {k}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRows((cur) => [...cur, { id: ++rowSeq, key: '', value: '' }])}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-dashed border-line-strong px-3 text-sm text-muted-strong transition-colors hover:border-copper/60 hover:text-cream"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Özel alan
            </button>
          </div>
        </fieldset>

        <Switch checked={active} onChange={setActive} label="Aktif" description="Pasif yöntemler tamamlama ekranında gösterilmez." />
      </form>
    </Modal>
  )
}
