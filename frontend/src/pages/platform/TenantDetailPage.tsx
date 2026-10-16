import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, FlaskConical, Pencil, Receipt, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatPhone, formatPrice } from '../../lib/format'
import type { Payment, Subscription } from '../../types/api'
import { formatDateDMY } from './billing'
import { EditPeriodModal, PaymentModal, RenewModal, useSubscriptions } from './BillingModals'
import { WhatsappTenantCard } from './WhatsappTenantCard'
import { SignupReviewCard } from './SignupReviewCard'
import { NoteCard, OwnerCard, PanelLoginCard, RecentEventsCard, SetupCard, SupportCard } from './TenantDetailParts'
import { BillingStatusBadge, Money, PaymentStatusBadge, RemindButton, RemindedNote, useBillingSettings, useRemind } from './BillingParts'

export default function TenantDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const qc = useQueryClient()
  const toast = useToast()

  const tenantQ = useQuery({ queryKey: ['platform', 'tenant', String(id)], queryFn: () => platformApi.getTenant(id), enabled: Number.isFinite(id) })
  const billingQ = useQuery({ queryKey: ['platform', 'billing', 'tenants'], queryFn: platformApi.listTenantBilling })
  const subsQ = useSubscriptions(id)
  const paymentsQ = useQuery({ queryKey: ['platform', 'payments', id], queryFn: () => platformApi.listPayments({ tenant_id: id }) })
  const settingsQ = useBillingSettings()
  const { remind } = useRemind(settingsQ.data)

  const startTrial = useMutation({
    mutationFn: () => platformApi.startTrial(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success('14 günlük deneme başlatıldı')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const [renewing, setRenewing] = useState(false)
  const [paying, setPaying] = useState<{ subId: number | null } | null>(null)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [delSub, setDelSub] = useState<Subscription | null>(null)
  const [delPay, setDelPay] = useState<Payment | null>(null)

  const tenant = tenantQ.data
  const tb = billingQ.data?.find((t) => t.tenant_id === id)

  const deleteSub = useMutation({
    mutationFn: (s: Subscription) => platformApi.deleteSubscription(s.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success('Dönem silindi')
      setDelSub(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDelSub(null)
    },
  })
  const deletePay = useMutation({
    mutationFn: (p: Payment) => platformApi.deletePayment(p.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success('Ödeme silindi')
      setDelPay(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDelPay(null)
    },
  })

  if (!Number.isFinite(id)) {
    return <EmptyState title="İşletme bulunamadı" action={<Link to="/platform/odemeler" className="text-copper-bright hover:underline">Ödemelere dön</Link>} />
  }

  if (tenantQ.isLoading || billingQ.isLoading) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Yükleniyor">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (!tenant) {
    return (
      <EmptyState
        title="İşletme bulunamadı"
        description={tenantQ.isError ? errorMessage(tenantQ.error) : 'Bu işletme silinmiş ya da hiç var olmamış olabilir.'}
        action={<Link to="/platform/isletmeler" className="inline-flex min-h-11 items-center text-copper-bright hover:underline">İşletmelere dön</Link>}
      />
    )
  }

  const ref = { id: tenant.id, name: tenant.name }
  const siteUrl = `https://${tenant.slug}.behtechlabs.com`

  const subColumns: Column<Subscription>[] = [
    {
      key: 'plan',
      header: 'Paket',
      primary: true,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-cream">
            {s.plan_name} {s.is_trial ? <span className="text-xs font-normal text-info">(deneme)</span> : s.is_custom && <span className="text-xs font-normal text-muted">(özel)</span>}
          </p>
          <p className="text-xs font-normal tabular-nums text-muted">
            {formatDateDMY(s.start_date)} – {formatDateDMY(s.end_date)}
          </p>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Tutar',
      align: 'right',
      cell: (s) =>
        s.discount_percent > 0 ? (
          <div className="flex flex-col items-end gap-1">
            {s.list_price !== null && <Money value={s.list_price} className="text-xs text-muted line-through" />}
            <Money value={s.price} />
            <Badge tone="success">%{s.discount_percent} indirim</Badge>
          </div>
        ) : (
          <Money value={s.price} />
        ),
    },
    { key: 'paid', header: 'Ödenen', align: 'right', cell: (s) => <Money value={s.paid_amount} className="text-success" /> },
    {
      key: 'balance',
      header: 'Kalan',
      align: 'right',
      cell: (s) => (s.balance > 0 ? <Money value={s.balance} className="text-warning" /> : <span className="text-muted">—</span>),
    },
    { key: 'pay', header: 'Ödeme', cell: (s) => <PaymentStatusBadge status={s.payment_status} /> },
    {
      key: 'actions',
      header: 'İşlem',
      align: 'right',
      hideOnMobile: true,
      cell: (s) => subActions(s),
    },
  ]

  function subActions(s: Subscription) {
    return (
      <div className="flex items-center justify-end gap-1">
        {s.balance > 0 && (
          <IconButton label="Bu döneme ödeme al" onClick={() => setPaying({ subId: s.id })}>
            <Receipt className="size-4" />
          </IconButton>
        )}
        <IconButton label="Dönemi düzenle" onClick={() => setEditing(s)}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton label="Dönemi sil" onClick={() => setDelSub(s)}>
          <Trash2 className="size-4 text-danger" />
        </IconButton>
      </div>
    )
  }

  const payColumns: Column<Payment>[] = [
    {
      key: 'date',
      header: 'Tarih',
      primary: true,
      cell: (p) => (
        <div className="min-w-0">
          <p className="tabular-nums">{formatDateDMY(p.paid_on)}</p>
          {p.note && <p className="truncate text-xs font-normal text-muted">{p.note}</p>}
        </div>
      ),
    },
    { key: 'amount', header: 'Tutar', align: 'right', cell: (p) => <Money value={p.amount} className="font-medium text-success" /> },
    { key: 'method', header: 'Yöntem', cell: (p) => <span className="text-muted-strong">{p.method}</span> },
    { key: 'period', header: 'Dönem', cell: (p) => <span className="text-muted-strong">{p.subscription_label ?? '—'}</span> },
    {
      key: 'actions',
      header: 'İşlem',
      align: 'right',
      hideOnMobile: true,
      cell: (p) => (
        <IconButton label="Ödemeyi sil" onClick={() => setDelPay(p)}>
          <Trash2 className="size-4 text-danger" />
        </IconButton>
      ),
    },
  ]

  return (
    <>
      <Link to="/platform/odemeler" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-cream">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Ödemeler
      </Link>

      {tenant.signup_status === 'pending' && <SignupReviewCard tenant={tenant} />}

      <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-3">İşletme</p>
          <h1 className="break-words font-display text-3xl font-medium leading-tight tracking-tight text-cream md:text-4xl">{tenant.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={tenant.is_active ? 'success' : 'neutral'}>{tenant.is_active ? 'Site açık' : 'Site kapalı'}</Badge>
            {tb && <BillingStatusBadge tb={tb} graceDays={settingsQ.data?.grace_days} />}
            {tb?.auto_suspended_at && <Badge tone="danger">Otomatik askıda</Badge>}
          </div>
          <p className="mt-3 break-words text-sm text-muted">
            {tenant.owner_name ?? 'Sahip yok'}
            {tenant.owner_phone && (
              <>
                {' · '}
                <a href={`tel:0${tenant.owner_phone}`} className="tabular-nums text-muted-strong hover:text-copper-bright">
                  {formatPhone(tenant.owner_phone)}
                </a>
              </>
            )}
          </p>
          <a href={siteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1.5 break-all text-sm text-muted hover:text-copper-bright">
            {tenant.slug}.behtechlabs.com <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button leftIcon={<RefreshCw className="size-4" />} onClick={() => setRenewing(true)}>
            Yenile / dönem ekle
          </Button>
          {subsQ.data?.length === 0 && (
            <Button variant="secondary" leftIcon={<FlaskConical className="size-4" />} onClick={() => startTrial.mutate()} loading={startTrial.isPending}>
              Deneme başlat
            </Button>
          )}
          <Button variant="secondary" leftIcon={<Receipt className="size-4" />} onClick={() => setPaying({ subId: null })}>
            Ödeme al
          </Button>
          {tb && <RemindButton tb={tb} settings={settingsQ.data} remind={remind} />}
        </div>
      </header>

      {tb && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:mb-8 md:gap-4 lg:grid-cols-4">
          <Summary label="Kapsama bitişi" value={tb.coverage_end ? formatDateDMY(tb.coverage_end) : '—'} hint={tb.days_left !== null ? (tb.days_left >= 0 ? `${tb.days_left} gün kaldı` : `${-tb.days_left} gün önce bitti`) : undefined} />
          <Summary label="Bekleyen" value={formatPrice(tb.outstanding)} tone={tb.outstanding > 0 ? 'text-warning' : undefined} />
          <Summary label="Son ödeme" value={tb.last_payment_on ? formatDateDMY(tb.last_payment_on) : '—'} />
          <Summary label="Hatırlatma" value={tb.reminded_at ? <RemindedNote at={tb.reminded_at} /> : '—'} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:mb-8 lg:grid-cols-2">
        <SetupCard tenant={tenant} />
        <OwnerCard tenant={tenant} />
        <NoteCard key={tenant.note ?? ''} tenant={tenant} />
        <RecentEventsCard tenantId={tenant.id} />
        <PanelLoginCard tenant={tenant} />
        <SupportCard tenant={tenant} />
        <WhatsappTenantCard tenantId={tenant.id} />
      </div>

      <Card>
        <CardHeader title="Abonelik dönemleri" description="Her yenileme yeni bir dönemdir." />
        {subsQ.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(subsQ.error)}</p>
        ) : (
          <Table
            caption="Abonelik dönemleri"
            columns={subColumns}
            rows={subsQ.data ?? []}
            rowKey={(s) => s.id}
            loading={subsQ.isLoading}
            mobileActions={subActions}
            empty={
              <EmptyState
                icon={<RefreshCw />}
                title="Henüz dönem yok"
                description="Bu işletme takip dışı. İlk dönemi ekleyince takip başlar."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => startTrial.mutate()} loading={startTrial.isPending}>14 günlük deneme başlat</Button>
                    <Button variant="secondary" onClick={() => setRenewing(true)}>Dönem ekle</Button>
                  </div>
                }
              />
            }
          />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Ödemeler" />
        {paymentsQ.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(paymentsQ.error)}</p>
        ) : (
          <Table
            caption="Ödemeler"
            columns={payColumns}
            rows={paymentsQ.data ?? []}
            rowKey={(p) => p.id}
            loading={paymentsQ.isLoading}
            mobileActions={(p) => (
              <IconButton label="Ödemeyi sil" onClick={() => setDelPay(p)}>
                <Trash2 className="size-4 text-danger" />
              </IconButton>
            )}
            empty={<EmptyState icon={<Receipt />} title="Henüz ödeme yok" description="Alınan ödemeler burada listelenir." />}
          />
        )}
      </Card>

      {renewing && <RenewModal tenant={ref} onClose={() => setRenewing(false)} />}
      {paying && <PaymentModal tenant={ref} subscriptionId={paying.subId} onClose={() => setPaying(null)} />}
      <EditPeriodModal sub={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!delSub}
        onClose={() => setDelSub(null)}
        onConfirm={() => delSub && deleteSub.mutate(delSub)}
        destructive
        loading={deleteSub.isPending}
        title="Dönem silinsin mi?"
        confirmLabel="Sil"
        description={delSub && <>{delSub.plan_name} dönemi ({formatDateDMY(delSub.start_date)} – {formatDateDMY(delSub.end_date)}) silinecek. Ödemesi varsa önce ödemeleri silmeniz gerekir.</>}
      />
      <ConfirmDialog
        open={!!delPay}
        onClose={() => setDelPay(null)}
        onConfirm={() => delPay && deletePay.mutate(delPay)}
        destructive
        loading={deletePay.isPending}
        title="Ödeme silinsin mi?"
        confirmLabel="Sil"
        description={delPay && <>{formatDateDMY(delPay.paid_on)} tarihli {formatPrice(delPay.amount)} ödeme kaydı silinecek.</>}
      />
    </>
  )
}

function Summary({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-panel-line bg-panel p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-2 break-words font-display text-xl font-medium tabular-nums ${tone ?? 'text-cream'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}
