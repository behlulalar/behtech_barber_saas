import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { AnnouncementStrip } from '../../components/AnnouncementBanner'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Checkbox } from '../../components/ui/Checkbox'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { SegmentedControl } from '../../components/ui/Tabs'
import { Table, type Column } from '../../components/ui/Table'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { todayLocalISO } from '../../lib/format'
import type { AnnouncementIn, AnnouncementLevel, AnnouncementOut, AnnouncementStatus } from '../../types/api'
import { formatDateDMY } from './billing'
import { ServerError } from './platformShared'

const STATUS_LABELS: Record<AnnouncementStatus, string> = { active: 'Yayında', scheduled: 'Zamanlanmış', ended: 'Bitti' }
const STATUS_TONES: Record<AnnouncementStatus, BadgeTone> = { active: 'success', scheduled: 'info', ended: 'neutral' }
const LEVEL_LABELS: Record<AnnouncementLevel, string> = { info: 'Bilgi', warning: 'Uyarı' }

const TITLE_MAX = 120
const BODY_MAX = 2000

function dateRange(a: AnnouncementOut): string {
  return `${formatDateDMY(a.starts_on)} – ${a.ends_on ? formatDateDMY(a.ends_on) : 'süresiz'}`
}

export default function AnnouncementsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const listQ = useQuery({ queryKey: ['platform', 'announcements'], queryFn: platformApi.listAnnouncements })
  const [form, setForm] = useState<{ item: AnnouncementOut | null } | null>(null)
  const [deleting, setDeleting] = useState<AnnouncementOut | null>(null)

  const remove = useMutation({
    mutationFn: (a: AnnouncementOut) => platformApi.deleteAnnouncement(a.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'announcements'] })
      toast.success('Duyuru silindi')
      setDeleting(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDeleting(null)
    },
  })

  const actions = (a: AnnouncementOut) => (
    <div className="flex items-center justify-end gap-1">
      <IconButton label={`${a.title} düzenle`} onClick={() => setForm({ item: a })}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label={`${a.title} sil`} onClick={() => setDeleting(a)}>
        <Trash2 className="size-4 text-danger" />
      </IconButton>
    </div>
  )

  const columns: Column<AnnouncementOut>[] = [
    {
      key: 'title',
      header: 'Başlık',
      primary: true,
      cell: (a) => (
        <div className="min-w-0">
          <p className="break-words font-medium text-cream">{a.title}</p>
          <p className="text-xs font-normal tabular-nums text-muted">{dateRange(a)}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Durum', cell: (a) => <Badge tone={STATUS_TONES[a.status]}>{STATUS_LABELS[a.status]}</Badge> },
    { key: 'level', header: 'Seviye', cell: (a) => <Badge tone={a.level === 'warning' ? 'warning' : 'neutral'}>{LEVEL_LABELS[a.level]}</Badge> },
    {
      key: 'target',
      header: 'Hedef',
      cell: (a) => <span className="text-muted-strong">{a.target_all ? 'Tüm işletmeler' : `${a.tenant_ids.length} işletme`}</span>,
    },
    { key: 'actions', header: 'İşlem', align: 'right', hideOnMobile: true, cell: actions },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Duyurular"
        description="İşletme panelinin üstünde gösterilen mesajlar. Bakım, yenilik ya da önemli hatırlatmalar için."
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setForm({ item: null })}>
            Yeni duyuru
          </Button>
        }
      />
      <Card>
        {listQ.isError ? (
          <ServerError message={errorMessage(listQ.error)} />
        ) : (
          <Table
            columns={columns}
            rows={listQ.data ?? []}
            rowKey={(a) => a.id}
            loading={listQ.isLoading}
            caption="Duyurular"
            mobileActions={actions}
            empty={<EmptyState icon={<Megaphone />} title="Henüz duyuru yok" description="İlk duyuruyu oluşturunca işletme panellerinde görünür." />}
          />
        )}
      </Card>

      {form && <AnnouncementForm key={form.item?.id ?? 'new'} item={form.item} onClose={() => setForm(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        destructive
        loading={remove.isPending}
        title="Duyuru silinsin mi?"
        confirmLabel="Sil"
        description={deleting && <><strong className="text-cream">{deleting.title}</strong> duyurusu silinir ve işletme panellerinden kalkar.</>}
      />
    </>
  )
}

function AnnouncementForm({ item, onClose }: { item: AnnouncementOut | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const optionsQ = useQuery({ queryKey: ['platform', 'tenant-options'], queryFn: platformApi.listTenantOptions })

  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [level, setLevel] = useState<AnnouncementLevel>(item?.level ?? 'info')
  const [targetAll, setTargetAll] = useState(item?.target_all ?? true)
  const [selected, setSelected] = useState<number[]>(item?.tenant_ids ?? [])
  const [search, setSearch] = useState('')
  const [startsOn, setStartsOn] = useState(item?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(item?.ends_on ?? '')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const errors = {
    title: !title.trim() ? 'Başlık gerekli.' : null,
    body: !body.trim() ? 'Mesaj gerekli.' : null,
    tenants: !targetAll && selected.length === 0 ? 'En az bir işletme seçin.' : null,
    ends: endsOn && endsOn < (startsOn || todayLocalISO()) ? 'Bitiş, başlangıçtan önce olamaz.' : null,
  }
  const hasError = Object.values(errors).some(Boolean)
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null)

  const options = optionsQ.data ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    return q ? options.filter((o) => o.name.toLocaleLowerCase('tr-TR').includes(q) || o.slug.includes(q)) : options
  }, [options, search])

  const mutation = useMutation({
    mutationFn: () => {
      const common = {
        title: title.trim(),
        body: body.trim(),
        level,
        target_all: targetAll,
        tenant_ids: targetAll ? [] : selected,
      }
      if (item) {
        return platformApi.updateAnnouncement(item.id, {
          ...common,
          starts_on: startsOn || undefined,
          ends_on: endsOn || undefined,
          clear_ends_on: !endsOn,
        })
      }
      const data: AnnouncementIn = { ...common, starts_on: startsOn || undefined, ends_on: endsOn || null }
      return platformApi.createAnnouncement(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'announcements'] })
      toast.success(item ? 'Duyuru güncellendi' : 'Duyuru oluşturuldu')
      onClose()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (hasError) return
    mutation.mutate()
  }

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!mutation.isPending}
      title={item ? 'Duyuruyu düzenle' : 'Yeni duyuru'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="announcement-form" loading={mutation.isPending}>
            {item ? 'Kaydet' : 'Duyuruyu oluştur'}
          </Button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="Başlık" required error={show('title')}>
          <Input data-autofocus value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Mesaj" required error={show('body')} hint={`${body.length} / ${BODY_MAX}`}>
          <Textarea rows={4} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium tracking-wide text-muted-strong">Seviye</span>
          <SegmentedControl
            label="Seviye"
            value={level}
            onChange={setLevel}
            items={[
              { value: 'info', label: 'Bilgi' },
              { value: 'warning', label: 'Uyarı' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium tracking-wide text-muted-strong">Hedef</span>
          <SegmentedControl
            label="Hedef"
            value={targetAll ? 'all' : 'some'}
            onChange={(v) => setTargetAll(v === 'all')}
            items={[
              { value: 'all', label: 'Tüm işletmeler' },
              { value: 'some', label: 'Seçili işletmeler' },
            ]}
          />
          {!targetAll && (
            <div className="mt-2 rounded-md border border-panel-line p-3">
              <Input aria-label="İşletme ara" placeholder="İşletme ara" value={search} onChange={(e) => setSearch(e.target.value)} />
              <p className="mt-2 text-xs text-muted">{selected.length} işletme seçili</p>
              <div className="mt-1 max-h-52 overflow-y-auto">
                {optionsQ.isLoading && <p className="py-2 text-sm text-muted">Yükleniyor…</p>}
                {filtered.map((o) => (
                  <Checkbox key={o.id} label={o.name} description={o.slug} checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                ))}
                {!optionsQ.isLoading && filtered.length === 0 && <p className="py-2 text-sm text-muted">İşletme bulunamadı.</p>}
              </div>
              {show('tenants') && (
                <p role="alert" className="mt-2 text-xs font-medium text-danger">
                  {show('tenants')}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Başlangıç" hint="Boşsa bugün.">
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Bitiş" hint="Boşsa süresiz." error={show('ends')}>
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>
        {endsOn && (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEndsOn('')}>
              Süresiz yap
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium tracking-wide text-muted-strong">Önizleme (işletme panelinde)</span>
          <AnnouncementStrip title={title.trim() || 'Başlık'} body={body.trim() || 'Mesaj metni burada görünür.'} level={level} onDismiss={() => {}} />
        </div>
        <ServerError message={serverError} />
      </form>
    </Modal>
  )
}
