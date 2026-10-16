import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BASE_DOMAIN } from '../../lib/site'
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Link2, Pencil, Plus, Power, Receipt, Search, Store } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Select } from '../../components/ui/Select'
import { Checkbox } from '../../components/ui/Checkbox'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Table, type Column } from '../../components/ui/Table'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatNumber, formatPhone, formatTimestamp, isValidPhone, normalizePhone } from '../../lib/format'
import type { PlatformTenant, TenantSort, TenantStatusFilter } from '../../types/api'
import { BillingStatusBadge } from './BillingParts'
import { SetupChip } from './SetupParts'

const PAGE_SIZE = 25

const SORTS: { value: TenantSort; label: string }[] = [
  { value: '-created', label: 'En yeni' },
  { value: 'created', label: 'En eski' },
  { value: 'name', label: 'Ad (A-Z)' },
  { value: '-name', label: 'Ad (Z-A)' },
  { value: '-staff', label: 'Personel (çok-az)' },
  { value: 'staff', label: 'Personel (az-çok)' },
  { value: '-appointments', label: 'Randevu (çok-az)' },
  { value: 'appointments', label: 'Randevu (az-çok)' },
]

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const SLUG_RE = /^[a-z0-9-]{3,40}$/
const RESERVED = ['www', 'api', 'admin', 'platform', 'app', 'mail', 'saleshub', 'panel', 'static', 'randevu']

function slugError(slug: string): string | null {
  if (!slug) return 'Adres gerekli.'
  if (!SLUG_RE.test(slug) || slug.startsWith('-') || slug.endsWith('-'))
    return '3-40 karakter; küçük harf, rakam ve tire. Tire ile başlayıp bitemez.'
  if (RESERVED.includes(slug)) return 'Bu adres rezerve edilmiş.'
  return null
}

/* ------------------------------ Bağlantılar ------------------------------ */

const LINKS = [
  { path: '/', label: 'Müşteri sitesi', hint: 'İşletmenin tanıtım sayfası' },
  { path: '/randevu', label: 'Randevu al', hint: 'Müşterilerle paylaşılacak randevu bağlantısı' },
  { path: '/randevularim', label: 'Randevularım', hint: 'Müşterinin randevularını görüp iptal ettiği sayfa' },
] as const

function productionBase(slug: string) {
  return `https://${slug}.${BASE_DOMAIN}`
}

// Geliştirmede Vite proxy'si tenant'ı `<slug>.localhost` adresinden çözer (bkz. vite.config.ts).
function localBase(slug: string) {
  const port = window.location.port ? `:${window.location.port}` : ''
  return `${window.location.protocol}//${slug}.localhost${port}`
}

function displayUrl(url: string) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Kopyalanamadı, adresi elle seçip kopyalayın')
    }
  }

  return (
    <IconButton label={copied ? 'Kopyalandı' : `${label} adresini kopyala`} onClick={copy}>
      {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
    </IconButton>
  )
}

function LinkRow({ url, label, hint }: { url: string; label: string; hint: string }) {
  return (
    <li className="flex items-center gap-2 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-cream">{label}</p>
        <p className="text-sm break-words text-muted-strong">
          {displayUrl(url)
            .split('/')
            .map((part, i) => (
              // Uzun adres kelime ortasından değil, "/" sonrasından satır atlasın.
              <span key={i}>
                {i > 0 && (
                  <>
                    /<wbr />
                  </>
                )}
                {part}
              </span>
            ))}
        </p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <CopyButton value={url} label={label} />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label} sayfasını yeni sekmede aç`}
        title="Yeni sekmede aç"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-strong transition-colors hover:bg-cream/5 hover:text-cream"
      >
        <ExternalLink className="size-4" />
      </a>
    </li>
  )
}

function LinksModal({ tenant, onClose }: { tenant: PlatformTenant | null; onClose: () => void }) {
  const slug = tenant?.slug ?? ''
  const links: readonly { path: string; label: string; hint: string }[] = tenant?.panel_login_path
    ? [...LINKS, { path: tenant.panel_login_path, label: 'Yönetim paneli', hint: 'Gizli giriş adresi; yalnızca işletme ekibiyle paylaşın' }]
    : LINKS
  return (
    <Modal
      open={!!tenant}
      onClose={onClose}
      title={tenant ? `${tenant.name} bağlantıları` : 'Bağlantılar'}
      description="Adresleri kopyalayıp işletme sahibiyle paylaşabilirsiniz."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Kapat
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {tenant && !tenant.is_active && (
          <p className="rounded-md border border-line-strong bg-surface p-3 text-sm text-muted-strong">
            Bu işletme pasif; aktifleştirilene kadar bu adresler çalışmaz.
          </p>
        )}
        <section>
          <h3 className="eyebrow mb-1">Canlı adresler</h3>
          <ul>
            {links.map((l) => (
              <LinkRow key={l.path} url={productionBase(slug) + l.path} label={l.label} hint={l.hint} />
            ))}
          </ul>
        </section>
        {import.meta.env.DEV && (
          <section>
            <h3 className="eyebrow mb-1">Yerel geliştirme</h3>
            <p className="mb-1 text-xs text-muted">Chrome, Edge veya Firefox'ta açın; Safari *.localhost adreslerini çözmez.</p>
            <ul>
              {links.map((l) => (
                <LinkRow key={l.path} url={localBase(slug) + l.path} label={l.label} hint={l.hint} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------ Oluştur ------------------------------ */

const EMPTY = { name: '', slug: '', owner_name: '', owner_surname: '', owner_phone: '', owner_password: '' }

function CreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (tenant: PlatformTenant) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [touched, setTouched] = useState(false)
  const [startTrial, setStartTrial] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const errors = {
    name: form.name.trim() ? null : 'İşletme adı gerekli.',
    slug: slugError(form.slug),
    owner_name: form.owner_name.trim() ? null : 'Ad gerekli.',
    owner_surname: form.owner_surname.trim() ? null : 'Soyad gerekli.',
    owner_phone: isValidPhone(form.owner_phone) ? null : 'Geçerli bir telefon girin (5XXXXXXXXX).',
    owner_password: form.owner_password.length >= 6 ? null : 'En az 6 karakter.',
  }
  const hasError = Object.values(errors).some(Boolean)
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null)

  const mutation = useMutation({
    mutationFn: platformApi.createTenant,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success(`${t.name} oluşturuldu`)
      close()
      onCreated(t)
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  function close() {
    setForm(EMPTY)
    setTouched(false)
    setStartTrial(true)
    setServerError(null)
    onClose()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (hasError) return
    mutation.mutate({
      name: form.name.trim(),
      slug: form.slug,
      owner_name: form.owner_name.trim(),
      owner_surname: form.owner_surname.trim(),
      owner_phone: normalizePhone(form.owner_phone),
      owner_password: form.owner_password,
      start_trial: startTrial,
      trial_days: 14,
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!mutation.isPending}
      title="Yeni işletme"
      description="İşletmeyi ve işletme sahibinin hesabını birlikte oluşturur."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="create-tenant-form" loading={mutation.isPending}>
            İşletmeyi oluştur
          </Button>
        </>
      }
    >
      <form id="create-tenant-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="İşletme adı" required error={show('name')}>
          <Input data-autofocus autoComplete="off" value={form.name} onChange={(e) => set('name')(e.target.value)} />
        </Field>
        <Field
          label="Adres (slug)"
          required
          error={show('slug')}
          hint={
            <>
              Yayın adresi: <span className="break-all text-cream">{form.slug || 'adres'}.{BASE_DOMAIN}</span>
            </>
          }
        >
          <Input
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={form.slug}
            onChange={(e) => set('slug')(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Sahip adı" required error={show('owner_name')}>
            <Input autoComplete="off" value={form.owner_name} onChange={(e) => set('owner_name')(e.target.value)} />
          </Field>
          <Field label="Sahip soyadı" required error={show('owner_surname')}>
            <Input autoComplete="off" value={form.owner_surname} onChange={(e) => set('owner_surname')(e.target.value)} />
          </Field>
        </div>
        <Field label="Sahip telefonu" required error={show('owner_phone')} hint="Panele bu numara ile giriş yapılır.">
          <PhoneInput autoComplete="off" value={form.owner_phone} onValueChange={set('owner_phone')} />
        </Field>
        <Field label="Geçici şifre" required error={show('owner_password')}>
          <Input type="password" autoComplete="new-password" value={form.owner_password} onChange={(e) => set('owner_password')(e.target.value)} />
        </Field>
        <Checkbox
          checked={startTrial}
          onChange={(e) => setStartTrial(e.target.checked)}
          label="14 günlük deneme başlat"
          description="Deneme bitince ödeme alınmazsa işletme otomatik askıya alınır; veriler silinmez."
        />
        {serverError && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  )
}

/* ------------------------------ Düzenle ------------------------------ */

function EditModal({ tenant, onClose }: { tenant: PlatformTenant | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(tenant?.name ?? '')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (n: string) => platformApi.updateTenant(tenant!.id, { name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success('İşletme güncellendi')
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('İşletme adı gerekli.')
      return
    }
    setError(null)
    mutation.mutate(name.trim())
  }

  return (
    <Modal
      open={!!tenant}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="sm"
      title="İşletmeyi düzenle"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="edit-tenant-form" loading={mutation.isPending}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="edit-tenant-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="İşletme adı" required error={error}>
          <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <p className="text-xs text-muted">
          Adres <span className="text-cream">{tenant?.slug}.{BASE_DOMAIN}</span> değiştirilemez.
        </p>
      </form>
    </Modal>
  )
}

/* ------------------------------ Sayfa ------------------------------ */

export default function TenantsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TenantStatusFilter>('all')
  const [sort, setSort] = useState<TenantSort>('-created')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const dq = useDebounced(q.trim())
  const params = { search: dq || undefined, status: filter, sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['platform', 'tenants', params],
    queryFn: () => platformApi.listTenants(params),
    placeholderData: keepPreviousData,
  })
  const billing = useQuery({ queryKey: ['platform', 'billing', 'tenants'], queryFn: platformApi.listTenantBilling })
  const billingById = useMemo(() => new Map((billing.data ?? []).map((b) => [b.tenant_id, b])), [billing.data])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<PlatformTenant | null>(null)
  const [deactivating, setDeactivating] = useState<PlatformTenant | null>(null)
  const [linksFor, setLinksFor] = useState<PlatformTenant | null>(null)
  const toggle = useMutation({
    mutationFn: (t: PlatformTenant) => platformApi.updateTenant(t.id, { is_active: !t.is_active }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success(t.is_active ? `${t.name} aktifleştirildi` : `${t.name} devre dışı bırakıldı`)
      setDeactivating(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDeactivating(null)
    },
  })

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = !!dq || filter !== 'all'

  function onToggle(t: PlatformTenant) {
    if (t.is_active) setDeactivating(t)
    else toggle.mutate(t)
  }

  const actions = (t: PlatformTenant, mobile = false) => (
    <div className={mobile ? 'flex flex-wrap items-center justify-end gap-1' : 'flex items-center justify-end gap-1 whitespace-nowrap'}>
      <IconButton label={`${t.name} abonelik ve ödemeler`} onClick={() => navigate(`/platform/isletmeler/${t.id}`)}>
        <Receipt className="size-4" />
      </IconButton>
      <IconButton label={`${t.name} bağlantıları`} onClick={() => setLinksFor(t)}>
        <Link2 className="size-4" />
      </IconButton>
      <IconButton label={`${t.name} düzenle`} onClick={() => setEditing(t)}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton
        label={t.is_active ? `${t.name} devre dışı bırak` : `${t.name} aktifleştir`}
        onClick={() => onToggle(t)}
        disabled={toggle.isPending}
      >
        <Power className={t.is_active ? 'size-4' : 'size-4 text-success'} />
      </IconButton>
    </div>
  )

  const columns: Column<PlatformTenant>[] = [
    {
      key: 'name',
      header: 'İşletme',
      primary: true,
      cell: (t) => (
        <div className="min-w-0">
          <Link to={`/platform/isletmeler/${t.id}`} className="block truncate font-medium text-cream hover:text-copper-bright">
            {t.name}
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setLinksFor(t)
            }}
            className="inline-flex min-h-11 items-center gap-1 break-all text-left text-xs font-normal text-muted hover:text-copper-bright md:pointer-fine:min-h-0"
          >
            {t.slug}.{BASE_DOMAIN} <Link2 className="size-3 shrink-0" aria-hidden="true" />
          </button>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Sahip',
      cell: (t) =>
        t.owner_name || t.owner_phone ? (
          <div className="min-w-0">
            {t.owner_name && <p className="truncate text-cream">{t.owner_name}</p>}
            {t.owner_phone && (
              <a
                href={`tel:0${t.owner_phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex min-h-11 items-center text-sm whitespace-nowrap text-muted-strong tabular-nums hover:text-copper-bright md:pointer-fine:min-h-0"
              >
                {formatPhone(t.owner_phone)}
              </a>
            )}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Durum',
      cell: (t) =>
        t.signup_status === 'rejected' ? (
          <Badge tone="danger">Reddedildi</Badge>
        ) : t.auto_suspended ? (
          <Badge tone="danger">Askıda</Badge>
        ) : (
          <Badge tone={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'Aktif' : 'Pasif'}</Badge>
        ),
    },
    {
      key: 'billing',
      header: 'Abonelik',
      cell: (t) => {
        const b = billingById.get(t.id)
        return b ? <BillingStatusBadge tb={b} /> : <span className="text-muted">—</span>
      },
    },
    { key: 'setup', header: 'Kurulum', cell: (t) => <SetupChip setup={t.setup} /> },
    {
      key: 'counts',
      header: 'Kadro/Randevu',
      align: 'right',
      cell: (t) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatNumber(t.staff_count)} <span className="text-muted">/</span> {formatNumber(t.appointment_count)}
        </span>
      ),
    },
    { key: 'created', header: 'Oluşturulma', className: 'hidden 2xl:table-cell', cell: (t) => <span className="text-muted-strong">{formatTimestamp(t.created_at)}</span> },
    { key: 'actions', header: 'İşlem', align: 'right', hideOnMobile: true, cell: (t) => actions(t) },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="İşletmeler"
        description="Platformdaki berber işletmelerini ekleyin, düzenleyin veya devre dışı bırakın."
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Yeni işletme
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          label="Durum filtresi"
          value={filter}
          onChange={(v) => {
            setFilter(v)
            setPage(0)
          }}
          items={[
            { value: 'all', label: 'Tümü' },
            { value: 'trial', label: 'Deneme' },
            { value: 'active', label: 'Aktif' },
            { value: 'inactive', label: 'Pasif' },
            { value: 'suspended', label: 'Askıda' },
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row md:w-auto">
          <div className="sm:w-60">
            <Select
              aria-label="Sıralama"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as TenantSort)
                setPage(0)
              }}
            >
              {SORTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:w-72">
            <Input
              type="search"
              aria-label="İşletme ara"
              placeholder="Ad, adres, sahip veya telefon ara"
              leading={<Search className="size-4" />}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(0)
              }}
            />
          </div>
        </div>
      </div>

      {isError ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {errorMessage(error)}
        </p>
      ) : (
        <Table
          caption="İşletmeler"
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          loading={isLoading}
          mobileActions={(t) => actions(t, true)}
          empty={
            <EmptyState
              icon={<Store />}
              title={!filtered ? 'Henüz işletme yok' : 'Sonuç bulunamadı'}
              description={!filtered ? 'İlk işletmeyi ekleyerek başlayın.' : 'Arama veya filtreyi değiştirmeyi deneyin.'}
              action={
                !filtered ? (
                  <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                    Yeni işletme
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      {!isError && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {isLoading ? 'Yükleniyor…' : `Toplam ${formatNumber(total)} işletme`}
            {total > PAGE_SIZE && ` · Sayfa ${page + 1} / ${pageCount}`}
          </p>
          {total > PAGE_SIZE && (
            <div className="flex gap-2">
              <Button variant="secondary" leftIcon={<ChevronLeft className="size-4" />} disabled={page === 0 || isFetching} onClick={() => setPage((p) => p - 1)}>
                Önceki
              </Button>
              <Button variant="secondary" rightIcon={<ChevronRight className="size-4" />} disabled={page + 1 >= pageCount || isFetching} onClick={() => setPage((p) => p + 1)}>
                Sonraki
              </Button>
            </div>
          )}
        </div>
      )}

      <CreateModal open={creating} onClose={() => setCreating(false)} onCreated={setLinksFor} />
      <LinksModal tenant={linksFor} onClose={() => setLinksFor(null)} />
      <EditModal key={editing?.id ?? 'none'} tenant={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && toggle.mutate(deactivating)}
        destructive
        loading={toggle.isPending}
        title="İşletme devre dışı bırakılsın mı?"
        confirmLabel="Devre dışı bırak"
        description={
          deactivating && (
            <>
              <strong className="text-cream">{deactivating.name}</strong> devre dışı kalınca müşteriler randevu alamaz ve personel panele giriş yapamayabilir. Verileri silinmez; istediğiniz zaman yeniden aktifleştirebilirsiniz.
            </>
          )
        }
      />
    </>
  )
}
