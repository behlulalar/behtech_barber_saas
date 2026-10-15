import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, HardDrive, Play, RefreshCw, TriangleAlert, Workflow } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatCard } from '../../components/ui/StatCard'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import type { JobRun, SystemStatus } from '../../types/api'
import { StatusMark, type MarkState } from './SystemParts'
import { formatDateTimeDMY, ServerError } from './platformShared'

const REFRESH_MS = 30_000

function hoursText(h: number | null | undefined): string {
  if (h === null || h === undefined) return ''
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} dk önce`
  if (h < 48) return `${Math.round(h)} saat önce`
  return `${Math.round(h / 24)} gün önce`
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-cream">{children}</dd>
    </div>
  )
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-panel-line">{children}</dl>
}

function CardSkeleton() {
  return <Skeleton className="h-56 w-full" />
}

function resultSummary(r: JobRun): string {
  if (!r.ok) return r.error || 'Hata'
  const x = (r.result ?? {}) as Record<string, unknown>
  const parts: string[] = []
  if (typeof x.checked === 'number') parts.push(`${x.checked} işletme`)
  if (typeof x.notified === 'number' && x.notified) parts.push(`${x.notified} bildirim`)
  if (Array.isArray(x.suspended) && x.suspended.length) parts.push(`${x.suspended.length} askıya alındı`)
  if (Array.isArray(x.reactivated) && x.reactivated.length) parts.push(`${x.reactivated.length} yeniden açıldı`)
  return parts.join(' · ') || 'Tamamlandı'
}

function BillingCard({ s }: { s: SystemStatus['billing_job'] }) {
  const run = s.last_run
  return (
    <Card>
      <CardHeader title="Günlük kontrol" description="Süresi geçen işletmeleri askıya alır, hatırlatma gönderir." />
      {s.overdue && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Günlük kontrol 26 saatten uzun süredir başarıyla çalışmadı. Cron ayarını ve sunucuyu kontrol edin
            {s.last_ok_at ? ` (son başarılı: ${formatDateTimeDMY(s.last_ok_at)}).` : '.'}
          </span>
        </div>
      )}
      <Rows>
        <Row label="Son çalışma">{run ? formatDateTimeDMY(run.started_at) : 'Hiç çalışmadı'}</Row>
        <Row label="Sonuç">
          {run ? <StatusMark state={run.ok ? 'ok' : 'error'} label={run.ok ? 'Başarılı' : 'Hatalı'} /> : <StatusMark state="unknown" label="Kayıt yok" />}
        </Row>
        <Row label="Son başarılı">
          {s.last_ok_at ? `${formatDateTimeDMY(s.last_ok_at)} · ${hoursText(s.hours_since_last_ok)}` : 'Yok'}
        </Row>
        {run && <Row label="Tetikleyen">{run.trigger === 'cron' ? 'Zamanlanmış (cron)' : 'Elle'}</Row>}
      </Rows>
    </Card>
  )
}

function BackupCard({ b }: { b: SystemStatus['backup'] }) {
  const verify: { state: MarkState; label: string } =
    b.verified_ok === null ? { state: 'unknown', label: 'Doğrulanmadı' } : b.verified_ok ? { state: 'ok', label: 'Doğrulandı' } : { state: 'error', label: 'Doğrulama başarısız' }
  return (
    <Card>
      <CardHeader title="Yedekleme" description="Veritabanı yedeği ve geri yükleme doğrulaması." />
      {!b.ok && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{b.last_backup_at ? 'Son yedek 26 saatten eski.' : 'Henüz yedek alınmamış.'} Yedek cron ayarını kontrol edin.</span>
        </div>
      )}
      <Rows>
        <Row label="Son yedek">
          {b.last_backup_at ? `${formatDateTimeDMY(b.last_backup_at)} · ${hoursText(b.age_hours)}` : 'Yok'}
        </Row>
        <Row label="Durum">
          <StatusMark state={b.ok ? 'ok' : 'error'} label={b.ok ? 'Güncel' : 'Eski / yok'} />
        </Row>
        {b.file && <Row label="Dosya"><span className="break-all font-mono text-xs">{b.file}</span></Row>}
        {b.size_mb !== null && <Row label="Boyut">{b.size_mb.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB</Row>}
        <Row label="Geri yükleme testi">
          <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
            <StatusMark state={verify.state} label={verify.label} />
            {b.verified_at && <span className="text-xs text-muted">{formatDateTimeDMY(b.verified_at)}</span>}
          </span>
        </Row>
      </Rows>
    </Card>
  )
}

function waState(c: SystemStatus['channels']): { state: MarkState; label: string } {
  if (!c.whatsapp_configured) return { state: 'off', label: 'Yapılandırılmadı' }
  if (c.whatsapp_reachable === false) return { state: 'error', label: 'Erişilemiyor' }
  switch (c.whatsapp_state) {
    case 'open':
      return { state: 'ok', label: 'Bağlı' }
    case 'connecting':
      return { state: 'unknown', label: 'Bağlanıyor — QR bekliyor' }
    case 'close':
      return { state: 'error', label: 'Bağlı değil' }
    default:
      return c.whatsapp_reachable ? { state: 'ok', label: 'Erişilebilir' } : { state: 'unknown', label: 'Bilinmiyor' }
  }
}

function WhatsappCard({ c, w }: { c: SystemStatus['channels']; w: SystemStatus['whatsapp'] }) {
  const st = waState(c)
  const cols: Column<SystemStatus['whatsapp']['top_tenants'][number]>[] = [
    { key: 'name', header: 'İşletme', primary: true, cell: (t) => <span className="break-words">{t.name}</span> },
    { key: 'sent', header: 'Gönderilen', align: 'right', cell: (t) => <span className="tabular-nums">{formatNumber(t.sent)}</span> },
    {
      key: 'failed',
      header: 'Başarısız',
      align: 'right',
      cell: (t) => <span className={t.failed > 0 ? 'font-medium tabular-nums text-danger' : 'tabular-nums text-muted'}>{formatNumber(t.failed)}</span>,
    },
  ]
  return (
    <Card>
      <CardHeader title="WhatsApp" description="Randevu bildirimleri için bağlantı ve gönderim durumu." />
      <Rows>
        <Row label="Bağlantı">
          <StatusMark state={st.state} label={st.label} />
        </Row>
        <Row label="Gönderilen (24 sa)">{formatNumber(w.sent_24h)}</Row>
        <Row label="Başarısız (24 sa)">
          <span className={w.failed_24h > 0 ? 'font-medium text-danger' : undefined}>{formatNumber(w.failed_24h)}</span>
        </Row>
        <Row label="İşletme başına saatlik sınır">{formatNumber(w.hourly_limit)} mesaj</Row>
      </Rows>
      <h3 className="mb-2 mt-5 text-sm font-medium text-cream">En çok mesaj gönderen 5 işletme (24 sa)</h3>
      <Table
        columns={cols}
        rows={w.top_tenants.slice(0, 5)}
        rowKey={(t) => `${t.tenant_id ?? 'x'}-${t.name}`}
        caption="WhatsApp gönderimi en yüksek işletmeler"
        empty={<EmptyState title="Gönderim yok" description="Son 24 saatte WhatsApp mesajı gönderilmedi." />}
      />
    </Card>
  )
}

function ChannelsCard({ c }: { c: SystemStatus['channels'] }) {
  return (
    <Card>
      <CardHeader title="Bildirim kanalları" />
      <Rows>
        <Row label="E-posta">
          <StatusMark state={c.email_configured ? 'ok' : 'off'} label={c.email_configured ? 'Yapılandırıldı' : 'Yapılandırılmadı'} />
        </Row>
        <Row label="Anlık bildirim (push)">
          <StatusMark state={c.push_configured ? 'ok' : 'off'} label={c.push_configured ? 'Yapılandırıldı' : 'Yapılandırılmadı'} />
        </Row>
        <Row label="Push aboneleri">{formatNumber(c.push_subscribers)} cihaz</Row>
      </Rows>
    </Card>
  )
}

export default function SystemPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const status = useQuery({
    queryKey: ['platform', 'system', 'status'],
    queryFn: platformApi.getSystemStatus,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  })
  const runs = useQuery({
    queryKey: ['platform', 'system', 'runs'],
    queryFn: () => platformApi.listJobRuns('billing_checks', 10),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  })

  const runChecks = useMutation({
    mutationFn: platformApi.runChecks,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success(`Kontrol tamamlandı · ${r.checked} işletme kontrol edildi`)
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: ['platform', 'system'] })
      toast.error(errorMessage(err))
    },
  })

  const s = status.data
  const columns: Column<JobRun>[] = [
    { key: 'time', header: 'Başlangıç', primary: true, className: 'whitespace-nowrap', cell: (r) => <span className="tabular-nums">{formatDateTimeDMY(r.started_at)}</span> },
    { key: 'ok', header: 'Sonuç', cell: (r) => <StatusMark state={r.ok ? 'ok' : 'error'} label={r.ok ? 'Başarılı' : 'Hatalı'} /> },
    { key: 'trigger', header: 'Tetikleyen', cell: (r) => <Badge>{r.trigger === 'cron' ? 'Cron' : 'Elle'}</Badge> },
    {
      key: 'dur',
      header: 'Süre',
      cell: (r) => (r.duration_ms === null ? '—' : r.duration_ms < 1000 ? `${r.duration_ms} ms` : `${(r.duration_ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`),
    },
    { key: 'result', header: 'Özet', className: 'min-w-48', cell: (r) => <span className="break-words text-muted-strong">{resultSummary(r)}</span> },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Sistem"
        description="Günlük kontrol, yedek ve bildirim kanallarının durumu. Sekme açıkken 30 saniyede bir yenilenir."
        actions={
          <>
            <Button variant="ghost" leftIcon={<RefreshCw className="size-4" />} onClick={() => qc.invalidateQueries({ queryKey: ['platform', 'system'] })} disabled={status.isFetching}>
              Yenile
            </Button>
            <Button leftIcon={<Play className="size-4" />} onClick={() => runChecks.mutate()} loading={runChecks.isPending}>
              Kontrolleri şimdi çalıştır
            </Button>
          </>
        }
      />

      {status.isError && !s ? (
        <ServerError message={errorMessage(status.error)} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Veritabanı" icon={<Database />} loading={!s} value={s ? `${s.db.size_mb.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB` : ''} hint={s ? <StatusMark state={s.db.ok ? 'ok' : 'error'} label={s.db.ok ? 'Bağlantı sağlıklı' : 'Bağlantı sorunu'} /> : undefined} />
            <StatCard label="Aktif işletme" icon={<HardDrive />} loading={!s} value={s ? `${s.counts.active_tenants} / ${s.counts.tenants}` : ''} hint="aktif / toplam" />
            <StatCard label="İşlem kaydı (24 sa)" icon={<Workflow />} loading={!s} value={s ? formatNumber(s.counts.audit_logs_last_24h) : ''} hint={s ? `${s.counts.platform_admins} yönetici` : undefined} />
            <StatCard label="Hatalı giriş (24 sa)" icon={<TriangleAlert />} loading={!s} tone={s && s.counts.failed_logins_last_24h > 10 ? 'warning' : 'default'} value={s ? formatNumber(s.counts.failed_logins_last_24h) : ''} hint="başarısız deneme" />
          </div>

          {s && <WhatsappCard c={s.channels} w={s.whatsapp} />}

          <div className="grid gap-6 lg:grid-cols-3">
            {s ? <BillingCard s={s.billing_job} /> : <CardSkeleton />}
            {s ? <BackupCard b={s.backup} /> : <CardSkeleton />}
            {s ? <ChannelsCard c={s.channels} /> : <CardSkeleton />}
          </div>

          <Card>
            <CardHeader title="Son çalışmalar" description="Günlük kontrolün son 10 çalışması." />
            {runs.isError ? (
              <ServerError message={errorMessage(runs.error)} />
            ) : (
              <Table
                columns={columns}
                rows={runs.data ?? []}
                rowKey={(r) => r.id}
                loading={runs.isLoading}
                caption="Günlük kontrol çalışmaları"
                empty={<EmptyState title="Henüz çalışma yok" description="Kontrolleri elle çalıştırabilir ya da cron'u bekleyebilirsiniz." />}
              />
            )}
          </Card>
          {s && <p className="text-xs text-muted">Sunucu saati: {formatDateTimeDMY(s.server_time)}</p>}
        </div>
      )}
    </>
  )
}
