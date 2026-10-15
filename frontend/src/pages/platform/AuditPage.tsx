import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, FilterX, ScrollText, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Table, type Column } from '../../components/ui/Table'
import { errorMessage, platformApi } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import type { AuditLog } from '../../types/api'
import { ActorLabel, AuditDetails } from './AuditParts'
import { formatDateTimeDMY, ServerError } from './platformShared'

const PAGE_SIZE = 50

const GROUP_LABELS: Record<string, string> = {
  platform: 'Hesap',
  admin: 'Yönetici',
  tenant: 'İşletme',
  plan: 'Paket',
  subscription: 'Abonelik',
  payment: 'Ödeme',
  settings: 'Ayarlar',
  billing: 'Sistem',
}

function groupLabel(g: string): string {
  return GROUP_LABELS[g] ?? g
}

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function AuditPage() {
  const [group, setGroup] = useState('')
  const [action, setAction] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AuditLog | null>(null)
  const dq = useDebounced(q.trim())

  const actionsQ = useQuery({ queryKey: ['platform', 'audit', 'actions'], queryFn: platformApi.listAuditActions, staleTime: 5 * 60_000 })
  const tenantsQ = useQuery({ queryKey: ['platform', 'tenant-options'], queryFn: platformApi.listTenantOptions, staleTime: 60_000 })

  const groups = useMemo(() => [...new Set((actionsQ.data ?? []).map((a) => a.group))], [actionsQ.data])
  const actionOptions = useMemo(() => (actionsQ.data ?? []).filter((a) => !group || a.group === group), [actionsQ.data, group])

  const dateInvalid = !!dateFrom && !!dateTo && dateFrom > dateTo
  const params = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    group: group || undefined,
    action: action || undefined,
    tenant_id: tenantId ? Number(tenantId) : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    q: dq || undefined,
  }
  const audit = useQuery({
    queryKey: ['platform', 'audit', params],
    queryFn: () => platformApi.listAudit(params),
    placeholderData: keepPreviousData,
    enabled: !dateInvalid,
  })

  const total = audit.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = !!(group || action || tenantId || dateFrom || dateTo || q)

  function change<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(0)
    }
  }
  function reset() {
    setGroup('')
    setAction('')
    setTenantId('')
    setDateFrom('')
    setDateTo('')
    setQ('')
    setPage(0)
  }

  const columns: Column<AuditLog>[] = [
    {
      key: 'time',
      header: 'Zaman',
      primary: true,
      className: 'whitespace-nowrap',
      cell: (r) => <span className="tabular-nums">{formatDateTimeDMY(r.created_at)}</span>,
    },
    { key: 'actor', header: 'Kim', cell: (r) => <ActorLabel type={r.actor_type} label={r.actor_label} /> },
    { key: 'action', header: 'Eylem', cell: (r) => <Badge tone="copper">{r.action_label}</Badge> },
    { key: 'summary', header: 'Özet', className: 'min-w-64', cell: (r) => <span className="break-words">{r.summary}</span> },
    {
      key: 'tenant',
      header: 'İşletme',
      cell: (r) => r.tenant_name ?? (r.tenant_id ? `#${r.tenant_id}` : <span className="text-muted">—</span>),
    },
  ]

  return (
    <>
      <PageHeader eyebrow="Platform" title="Denetim kaydı" description="Kim, ne zaman, neyi değiştirdi. Kayıtlar silinemez." />

      <Card className="mb-4" padding="sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Grup">
            <Select
              value={group}
              onChange={(e) => {
                setGroup(e.target.value)
                setAction('')
                setPage(0)
              }}
            >
              <option value="">Tümü</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {groupLabel(g)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Eylem">
            <Select value={action} onChange={(e) => change(setAction)(e.target.value)}>
              <option value="">Tümü</option>
              {actionOptions.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="İşletme">
            <Select value={tenantId} onChange={(e) => change(setTenantId)(e.target.value)}>
              <option value="">Tümü</option>
              {(tenantsQ.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ara" >
            <Input
              type="search"
              value={q}
              onChange={(e) => change(setQ)(e.target.value)}
              placeholder="Özet veya kişi"
              leading={<Search className="size-4" aria-hidden="true" />}
            />
          </Field>
          <Field label="Başlangıç tarihi">
            <Input type="date" value={dateFrom} onChange={(e) => change(setDateFrom)(e.target.value)} max={dateTo || undefined} />
          </Field>
          <Field label="Bitiş tarihi" error={dateInvalid ? 'Bitiş, başlangıçtan önce olamaz' : undefined}>
            <Input type="date" value={dateTo} onChange={(e) => change(setDateTo)(e.target.value)} min={dateFrom || undefined} invalid={dateInvalid} />
          </Field>
          {filtered && (
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <Button variant="ghost" leftIcon={<FilterX className="size-4" />} onClick={reset} fullWidth>
                Filtreleri temizle
              </Button>
            </div>
          )}
        </div>
      </Card>

      {audit.isError && !audit.data ? (
        <ServerError message={errorMessage(audit.error)} />
      ) : (
        <>
          <Table
            columns={columns}
            rows={audit.data?.items ?? []}
            rowKey={(r) => r.id}
            loading={audit.isLoading}
            onRowClick={setSelected}
            caption="Denetim kayıtları"
            empty={
              <EmptyState
                icon={<ScrollText />}
                title={filtered ? 'Bu filtrelerle kayıt bulunamadı' : 'Henüz kayıt yok'}
                description={filtered ? 'Filtreleri değiştirmeyi ya da temizlemeyi deneyin.' : 'Yapılan işlemler burada listelenir.'}
              />
            }
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">
              {audit.isLoading ? 'Yükleniyor…' : `Toplam ${formatNumber(total)} kayıt`}
              {total > 0 && ` · Sayfa ${page + 1} / ${pageCount}`}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" leftIcon={<ChevronLeft className="size-4" />} disabled={page === 0 || audit.isFetching} onClick={() => setPage((p) => p - 1)}>
                Önceki
              </Button>
              <Button variant="secondary" rightIcon={<ChevronRight className="size-4" />} disabled={page + 1 >= pageCount || audit.isFetching} onClick={() => setPage((p) => p + 1)}>
                Sonraki
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.action_label ?? ''}
        description={selected ? `${formatDateTimeDMY(selected.created_at)} · ${selected.actor_label}` : undefined}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)} data-autofocus>
            Kapat
          </Button>
        }
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <p className="break-words text-sm text-cream">{selected.summary}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {selected.tenant_id && (
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-[0.1em] text-muted">İşletme</dt>
                  <dd className="mt-1 break-words text-cream">{selected.tenant_name ?? `#${selected.tenant_id}`}</dd>
                </div>
              )}
              {selected.ip && (
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-[0.1em] text-muted">IP adresi</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-cream">{selected.ip}</dd>
                </div>
              )}
            </dl>
            <div>
              <h3 className="mb-2 font-display text-base text-cream">Ayrıntılar</h3>
              <AuditDetails details={selected.details} />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
