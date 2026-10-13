import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Scissors, Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import { adminApi, errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { formatDuration, formatPrice } from '../../lib/format'
import type { AdminService } from '../../types/api'
import { ErrorBlock, qk, useServiceList } from './shared'

const DURATION_PRESETS = [15, 30, 45, 60, 90]

export default function ServicesPage() {
  const { isManager } = useStaffAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const query = useServiceList()
  const [editing, setEditing] = useState<AdminService | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminService | null>(null)

  const toggle = useMutation({
    mutationFn: (s: AdminService) => adminApi.updateService(s.id, { is_active: !s.is_active }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: qk.services })
      toast.success(s.is_active ? `${s.name} aktif edildi` : `${s.name} pasife alındı`)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: (s: AdminService) => adminApi.deleteService(s.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.services })
      toast.success('Hizmet silindi')
      setDeleting(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDeleting(null)
    },
  })

  const rows = query.data ?? []
  const activeCount = rows.filter((s) => s.is_active).length

  const columns: Column<AdminService>[] = [
    {
      key: 'name',
      header: 'Hizmet',
      primary: true,
      cell: (s) => <span className={cn('font-medium', !s.is_active && 'text-muted-strong')}>{s.name}</span>,
    },
    { key: 'duration', header: 'Süre', cell: (s) => formatDuration(s.duration_min) },
    { key: 'price', header: 'Fiyat', align: 'right', cell: (s) => <span className="font-display text-base tabular-nums">{formatPrice(s.price)}</span> },
    {
      key: 'active',
      header: 'Durum',
      cell: (s) =>
        isManager ? (
          <span className="inline-flex items-center gap-2">
            <Switch checked={s.is_active} disabled={toggle.isPending && toggle.variables?.id === s.id} onChange={() => toggle.mutate(s)} />
            <span className="sr-only">{s.is_active ? 'Aktif' : 'Pasif'}</span>
          </span>
        ) : (
          <Badge tone={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Aktif' : 'Pasif'}</Badge>
        ),
    },
  ]
  if (isManager) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      hideOnMobile: true,
      className: 'w-28',
      cell: (s) => <RowActions s={s} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} />,
    })
  }

  return (
    <>
      <PageHeader
        title="Hizmetler"
        description={query.data ? `${rows.length} hizmet · ${activeCount} aktif. Pasif hizmetler müşterilere gösterilmez.` : 'Sunduğunuz hizmetler, süreleri ve fiyatları.'}
        actions={
          isManager && (
            <Button onClick={() => setEditing('new')} leftIcon={<Plus className="size-4" />}>
              Yeni hizmet
            </Button>
          )
        }
      />

      {query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Table
          caption="Hizmet listesi"
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          loading={query.isLoading}
          mobileActions={isManager ? (s) => <RowActions s={s} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} /> : undefined}
          empty={
            <EmptyState
              icon={<Scissors />}
              title="Henüz hizmet yok"
              description="Müşterilerin randevu alabilmesi için en az bir hizmet ekleyin."
              action={
                isManager && (
                  <Button onClick={() => setEditing('new')} leftIcon={<Plus className="size-4" />}>
                    Hizmet ekle
                  </Button>
                )
              }
            />
          }
        />
      )}

      {editing && <ServiceForm key={editing === 'new' ? 'new' : editing.id} service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        destructive
        title="Hizmet silinsin mi?"
        description={
          <>
            <strong className="text-cream">{deleting?.name}</strong> kalıcı olarak silinecek. Randevusu olan hizmetler silinemez; onları pasife almanız yeterli.
          </>
        }
        confirmLabel="Sil"
      />
    </>
  )
}

function RowActions({ s, onEdit, onDelete }: { s: AdminService; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <IconButton label={`${s.name} düzenle`} onClick={onEdit}>
        <Pencil className="size-[18px]" />
      </IconButton>
      <IconButton label={`${s.name} sil`} onClick={onDelete} className="hover:text-danger">
        <Trash2 className="size-[18px]" />
      </IconButton>
    </div>
  )
}

function ServiceForm({ service, onClose }: { service: AdminService | null; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState(service?.name ?? '')
  const [price, setPrice] = useState(service ? String(service.price) : '')
  const [duration, setDuration] = useState(service ? String(service.duration_min) : '30')
  const [active, setActive] = useState(service?.is_active ?? true)
  const [touched, setTouched] = useState(false)

  const priceNum = price === '' ? NaN : Number(price)
  const durNum = duration === '' ? NaN : Number(duration)
  const errors = {
    name: touched && !name.trim() ? 'Hizmet adı gerekli.' : null,
    price: touched && !(Number.isInteger(priceNum) && priceNum >= 0 && priceNum <= 10_000_000) ? 'Geçerli bir fiyat girin (tam sayı, ₺).' : null,
    duration: touched && !(Number.isInteger(durNum) && durNum >= 5 && durNum <= 480) ? 'Süre 5 ile 480 dakika arasında olmalı.' : null,
  }

  const save = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), price: priceNum, duration_min: durNum, is_active: active }
      return service ? adminApi.updateService(service.id, data) : adminApi.createService(data)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.services })
      toast.success(service ? 'Hizmet güncellendi' : 'Hizmet eklendi')
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function submit() {
    setTouched(true)
    if (!name.trim() || !Number.isInteger(priceNum) || priceNum < 0 || !Number.isInteger(durNum) || durNum < 5 || durNum > 480) return
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!save.isPending}
      size="sm"
      title={service ? 'Hizmeti düzenle' : 'Yeni hizmet'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {service ? 'Kaydet' : 'Ekle'}
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
        <Field label="Hizmet adı" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} placeholder="Örn. Saç + sakal" data-autofocus autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fiyat (₺)" required error={errors.price}>
            <Input type="number" inputMode="numeric" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="450" />
          </Field>
          <Field label="Süre (dk)" required error={errors.duration}>
            <Input type="number" inputMode="numeric" min={5} max={480} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </div>
        <div className="-mt-2 flex flex-wrap gap-2" role="group" aria-label="Hızlı süre seçimi">
          {DURATION_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setDuration(String(m))}
              aria-pressed={duration === String(m)}
              className={cn(
                'min-h-11 min-w-14 rounded-sm border px-3 text-sm tabular-nums transition-colors',
                duration === String(m) ? 'border-copper bg-copper/15 text-copper-bright' : 'border-line-strong text-muted-strong hover:border-copper/60',
              )}
            >
              {formatDuration(m)}
            </button>
          ))}
        </div>
        <Switch checked={active} onChange={setActive} label="Aktif" description="Pasif hizmet müşterilere ve yeni randevulara sunulmaz." />
      </form>
    </Modal>
  )
}
