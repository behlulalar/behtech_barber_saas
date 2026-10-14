import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Switch } from '../../components/ui/Switch'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { ApiError, errorMessage, platformApi } from '../../lib/api'
import type { Plan } from '../../types/api'
import { parseAmount } from './billing'
import { Money } from './BillingParts'

function PlanModal({ plan, open, nextOrder, onClose }: { plan: Plan | null; open: boolean; nextOrder: number; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(plan?.name ?? '')
  const [months, setMonths] = useState(String(plan?.duration_months ?? 1))
  const [price, setPrice] = useState(plan ? String(plan.price) : '')
  const [order, setOrder] = useState(String(plan?.sort_order ?? nextOrder))
  const [active, setActive] = useState(plan?.is_active ?? true)
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const m = parseAmount(months)
  const pr = parseAmount(price)
  const errors = {
    name: !name.trim() ? 'Paket adı gerekli.' : null,
    months: !m || m < 1 || m > 60 ? '1 ile 60 arasında bir değer girin.' : null,
    price: pr === null ? 'Fiyat girin (0 olabilir).' : null,
  }
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null)

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), duration_months: m ?? 1, price: pr ?? 0, is_active: active, sort_order: parseAmount(order) ?? 0 }
      return plan ? platformApi.updatePlan(plan.id, body) : platformApi.createPlan(body)
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['platform', 'plans'] })
      toast.success(plan ? 'Paket güncellendi' : `${p.name} paketi eklendi`)
      onClose()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (Object.values(errors).some(Boolean)) return
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="sm"
      title={plan ? 'Paketi düzenle' : 'Yeni paket'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="plan-form" loading={mutation.isPending}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="Paket adı" required error={show('name')}>
          <Input data-autofocus autoComplete="off" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Süre (ay)" required error={show('months')}>
            <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </Field>
          <Field label="Liste fiyatı (₺)" required error={show('price')}>
            <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <Field label="Sıra" hint="Küçük sayı listede üstte görünür.">
          <Input inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />
        </Field>
        <Switch checked={active} onChange={setActive} label="Aktif" description="Pasif paketler yeni dönem eklerken seçilemez." />
        {serverError && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  )
}

export default function PlansPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['platform', 'plans'], queryFn: platformApi.listPlans })
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Plan | null>(null)

  const del = useMutation({
    mutationFn: (p: Plan) => platformApi.deletePlan(p.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'plans'] })
      toast.success('Paket silindi')
      setDeleting(null)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError && err.status === 409 ? 'Bu paket kullanılmış; silmek yerine pasife alın.' : errorMessage(err))
      setDeleting(null)
    },
  })

  const plans = data ?? []
  const nextOrder = plans.reduce((mx, p) => Math.max(mx, p.sort_order), 0) + 1

  const actions = (p: Plan) => (
    <div className="flex items-center justify-end gap-1">
      <IconButton label={`${p.name} düzenle`} onClick={() => setEditing(p)}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label={`${p.name} sil`} onClick={() => setDeleting(p)}>
        <Trash2 className="size-4 text-danger" />
      </IconButton>
    </div>
  )

  const columns: Column<Plan>[] = [
    { key: 'name', header: 'Paket', primary: true, cell: (p) => <span className="font-medium text-cream">{p.name}</span> },
    { key: 'months', header: 'Süre', cell: (p) => <span className="tabular-nums text-muted-strong">{p.duration_months} ay</span> },
    { key: 'price', header: 'Liste fiyatı', align: 'right', cell: (p) => <Money value={p.price} /> },
    { key: 'order', header: 'Sıra', align: 'right', cell: (p) => <span className="tabular-nums text-muted-strong">{p.sort_order}</span> },
    { key: 'active', header: 'Durum', cell: (p) => <Badge tone={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'Aktif' : 'Pasif'}</Badge> },
    { key: 'actions', header: 'İşlem', align: 'right', hideOnMobile: true, cell: actions },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Paketler"
        description="Abonelik paketleri ve liste fiyatları. Dönem eklerken fiyat işletmeye göre değiştirilebilir."
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Yeni paket
          </Button>
        }
      />
      {isError ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {errorMessage(error)}
        </p>
      ) : (
        <Table
          caption="Paketler"
          columns={columns}
          rows={plans}
          rowKey={(p) => p.id}
          loading={isLoading}
          mobileActions={actions}
          empty={<EmptyState icon={<Package />} title="Henüz paket yok" action={<Button onClick={() => setCreating(true)}>Yeni paket</Button>} />}
        />
      )}

      {creating && <PlanModal plan={null} open nextOrder={nextOrder} onClose={() => setCreating(false)} />}
      {editing && <PlanModal key={editing.id} plan={editing} open nextOrder={nextOrder} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting)}
        destructive
        loading={del.isPending}
        title="Paket silinsin mi?"
        confirmLabel="Sil"
        description={deleting && <><strong className="text-cream">{deleting.name}</strong> silinecek. Daha önce kullanıldıysa silinemez; bu durumda pasife alabilirsiniz.</>}
      />
    </>
  )
}
