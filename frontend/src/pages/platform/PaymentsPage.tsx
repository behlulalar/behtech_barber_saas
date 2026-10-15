import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Banknote, CalendarClock, CircleCheck, FlaskConical, Hourglass, Percent, Receipt, RefreshCw, Search, Settings2, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, buttonStyles } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatCard } from '../../components/ui/StatCard'
import { Table, type Column } from '../../components/ui/Table'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatPhone, formatPrice } from '../../lib/format'
import type { TenantBilling } from '../../types/api'
import { formatDateDMY, formatRate, STATUS_ORDER } from './billing'
import { PaymentModal, RenewModal, type TenantRef } from './BillingModals'
import { BillingStatusBadge, Money, RemindButton, RemindedNote, useBillingSettings, useRemind } from './BillingParts'

type Filter = 'all' | 'upcoming' | 'overdue' | 'untracked'

function ErrorBox({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      {errorMessage(error)}
    </p>
  )
}

export default function PaymentsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const overview = useQuery({ queryKey: ['platform', 'billing', 'overview'], queryFn: platformApi.getBillingOverview })
  const tenants = useQuery({ queryKey: ['platform', 'billing', 'tenants'], queryFn: platformApi.listTenantBilling })
  const settingsQ = useBillingSettings()
  const settings = settingsQ.data
  const { remind } = useRemind(settings)

  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [paying, setPaying] = useState<TenantRef | null>(null)
  const [renewing, setRenewing] = useState<TenantRef | null>(null)

  const startTrial = useMutation({
    mutationFn: (t: TenantBilling) => platformApi.startTrial(t.tenant_id),
    onSuccess: (_s, t) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success(`${t.tenant_name} için 14 günlük deneme başlatıldı`)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const runChecks = useMutation({
    mutationFn: platformApi.runChecks,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      const parts = [`${r.checked} işletme kontrol edildi`]
      if (r.notified) parts.push(`${r.notified} bildirim`)
      if (r.suspended.length) parts.push(`askıya alınan: ${r.suspended.join(', ')}`)
      if (r.reactivated.length) parts.push(`yeniden açılan: ${r.reactivated.join(', ')}`)
      if (r.email_sent) parts.push('e-posta gönderildi')
      if (r.push_sent) parts.push(`${r.push_sent} cihaza bildirim`)
      toast.success(parts.join(' · '))
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const s = overview.data?.stats
  const all = useMemo(() => tenants.data ?? [], [tenants.data])
  const counts = useMemo(
    () => ({
      all: all.length,
      upcoming: all.filter((t) => t.status === 'due_soon' || t.trial_ending).length,
      overdue: all.filter((t) => t.status === 'grace' || t.status === 'expired').length,
      untracked: all.filter((t) => t.status === 'untracked').length,
    }),
    [all],
  )
  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    return all
      .filter((t) => {
        if (filter === 'upcoming' && t.status !== 'due_soon' && !t.trial_ending) return false
        if (filter === 'overdue' && t.status !== 'grace' && t.status !== 'expired') return false
        if (filter === 'untracked' && t.status !== 'untracked') return false
        if (!needle) return true
        return t.tenant_name.toLocaleLowerCase('tr-TR').includes(needle) || t.slug.includes(needle) || (t.owner_name ?? '').toLocaleLowerCase('tr-TR').includes(needle)
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.days_left ?? 0) - (b.days_left ?? 0) || a.tenant_name.localeCompare(b.tenant_name, 'tr'))
  }, [all, filter, q])

  const ref = (t: TenantBilling): TenantRef => ({ id: t.tenant_id, name: t.tenant_name })
  const detail = (t: TenantBilling) => `/platform/isletmeler/${t.tenant_id}`

  const columns: Column<TenantBilling>[] = [
    {
      key: 'name',
      header: 'İşletme',
      primary: true,
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-cream">{t.tenant_name}</p>
          <p className="truncate text-xs font-normal text-muted">{t.slug}.behtechlabs.com</p>
        </div>
      ),
    },
    { key: 'status', header: 'Durum', cell: (t) => <BillingStatusBadge tb={t} graceDays={settings?.grace_days} /> },
    { key: 'plan', header: 'Paket', cell: (t) => <span className="text-muted-strong">{t.current?.plan_name ?? t.next?.plan_name ?? t.renewal_plan_name ?? '—'}</span> },
    { key: 'end', header: 'Bitiş', cell: (t) => <span className="tabular-nums text-muted-strong">{t.coverage_end ? formatDateDMY(t.coverage_end) : '—'}</span> },
    {
      key: 'outstanding',
      header: 'Bekleyen',
      align: 'right',
      cell: (t) => (t.outstanding > 0 ? <Money value={t.outstanding} className="text-warning" /> : <span className="text-muted">—</span>),
    },
    { key: 'last', header: 'Son ödeme', cell: (t) => <span className="tabular-nums text-muted-strong">{t.last_payment_on ? formatDateDMY(t.last_payment_on) : '—'}</span> },
    { key: 'actions', header: 'İşlem', align: 'right', hideOnMobile: true, cell: (t) => trialAction(t) },
  ]

  function trialAction(t: TenantBilling) {
    if (t.status !== 'untracked') return null
    return (
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<FlaskConical className="size-4" />}
        loading={startTrial.isPending && startTrial.variables?.tenant_id === t.tenant_id}
        onClick={(e) => {
          e.stopPropagation()
          startTrial.mutate(t)
        }}
      >
        Deneme başlat
      </Button>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Ödemeler"
        description="Abonelik dönemleri, tahsilatlar ve hatırlatmalar."
        actions={
          <>
            <Button variant="secondary" leftIcon={<RefreshCw className="size-4" />} loading={runChecks.isPending} onClick={() => runChecks.mutate()}>
              Kontrolleri şimdi çalıştır
            </Button>
            <Link to="/platform/paketler" className={buttonStyles({ variant: 'ghost' })}>
              <Settings2 className="size-4" aria-hidden="true" />
              Paketler
            </Link>
          </>
        }
      />

      {overview.isError && <div className="mb-4"><ErrorBox error={overview.error} /></div>}

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatCard label="Bu ay" value={s ? formatPrice(s.revenue_this_month) : ''} hint="tahsilat" icon={<Banknote />} tone="success" loading={overview.isLoading} />
        <StatCard label="Bu yıl" value={s ? formatPrice(s.revenue_this_year) : ''} hint="tahsilat" icon={<Wallet />} loading={overview.isLoading} />
        <StatCard label="Son 30 gün" value={s ? formatPrice(s.revenue_last_30_days) : ''} hint="tahsilat" icon={<CalendarClock />} loading={overview.isLoading} />
        <StatCard
          label="Bekleyen alacak"
          value={s ? formatPrice(s.outstanding_total) : ''}
          hint={s ? `${s.due_soon_count} yaklaşan · ${s.grace_count + s.expired_count} gecikmiş` : undefined}
          icon={<Hourglass />}
          tone={s && s.outstanding_total > 0 ? 'warning' : 'default'}
          loading={overview.isLoading}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:mt-4 md:gap-4 lg:grid-cols-4">
        <StatCard
          label="Aktif deneme"
          value={s ? String(s.trial_count) : ''}
          hint={s ? `bitmek üzere ${s.trial_ending_count}` : undefined}
          icon={<FlaskConical />}
          tone={s && s.trial_ending_count > 0 ? 'copper' : 'default'}
          loading={overview.isLoading}
        />
        <StatCard
          label="Deneme→ücretli"
          value={s ? formatRate(s.trial_conversion_rate) : ''}
          hint="dönüşüm oranı"
          icon={<Percent />}
          loading={overview.isLoading}
        />
      </div>

      <Card className="mt-6 md:mt-8">
        <CardHeader title="İlgilenmen gerekenler" description="Süresi dolan, yaklaşan veya ödemesi eksik işletmeler." />
        {overview.isLoading ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Yükleniyor">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (overview.data?.attention.length ?? 0) === 0 ? (
          <EmptyState icon={<CircleCheck />} title="Her şey yolunda" description="Şu an ilgilenmen gereken bir işletme yok." />
        ) : (
          <ul className="divide-y divide-panel-line">
            {overview.data!.attention.map((t) => (
              <li key={t.tenant_id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <Link to={detail(t)} className="block truncate font-medium text-cream hover:text-copper-bright">
                      {t.tenant_name}
                    </Link>
                    <p className="mt-0.5 break-words text-xs text-muted">
                      {t.owner_name ?? 'Sahip yok'}
                      {t.owner_phone && ` · ${formatPhone(t.owner_phone)}`}
                      {t.coverage_end && ` · Bitiş ${formatDateDMY(t.coverage_end)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BillingStatusBadge tb={t} graceDays={settings?.grace_days} />
                    {t.outstanding > 0 && (
                      <span className="text-sm font-medium text-warning">
                        <Money value={t.outstanding} /> <span className="font-normal text-muted">ödenmemiş</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <RemindButton tb={t} settings={settings} remind={remind} />
                  <Button size="sm" variant="secondary" leftIcon={<Receipt className="size-4" />} onClick={() => setPaying(ref(t))}>
                    Ödeme al
                  </Button>
                  <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="size-4" />} onClick={() => setRenewing(ref(t))}>
                    Yenile
                  </Button>
                  <Link to={detail(t)} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-copper-bright hover:underline">
                    Detay <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <RemindedNote at={t.reminded_at} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="mt-8" aria-labelledby="all-billing">
        <h2 id="all-billing" className="mb-4 font-display text-lg font-medium text-cream">
          Tüm işletmeler
        </h2>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs
            label="Abonelik filtresi"
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: 'Tümü', count: counts.all },
              { value: 'upcoming', label: 'Yaklaşan', count: counts.upcoming },
              { value: 'overdue', label: 'Gecikmiş', count: counts.overdue },
              { value: 'untracked', label: 'Takip dışı', count: counts.untracked },
            ]}
          />
          <div className="md:w-72">
            <Input type="search" aria-label="İşletme ara" placeholder="İşletme veya sahip ara" leading={<Search className="size-4" />} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {tenants.isError ? (
          <ErrorBox error={tenants.error} />
        ) : (
          <Table
            caption="İşletme abonelikleri"
            columns={columns}
            rows={rows}
            rowKey={(t) => t.tenant_id}
            loading={tenants.isLoading}
            onRowClick={(t) => navigate(detail(t))}
            mobileActions={trialAction}
            empty={<EmptyState icon={<Search />} title="Sonuç bulunamadı" description="Filtreyi veya aramayı değiştirmeyi deneyin." />}
          />
        )}
      </section>

      <Card className="mt-8">
        <CardHeader title="Son ödemeler" />
        {overview.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (overview.data?.recent_payments.length ?? 0) === 0 ? (
          <EmptyState icon={<Receipt />} title="Henüz ödeme yok" description="Kaydedilen ödemeler burada listelenir." />
        ) : (
          <ul className="divide-y divide-panel-line">
            {overview.data!.recent_payments.map((p) => (
              <li key={p.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link to={`/platform/isletmeler/${p.tenant_id}`} className="block truncate font-medium text-cream hover:text-copper-bright">
                    {p.tenant_name}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {formatDateDMY(p.paid_on)} · {p.method}
                    {p.subscription_label && ` · ${p.subscription_label}`}
                  </p>
                </div>
                <Money value={p.amount} className="font-medium text-success" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PaymentModal tenant={paying} onClose={() => setPaying(null)} />
      <RenewModal tenant={renewing} onClose={() => setRenewing(null)} />
    </>
  )
}
