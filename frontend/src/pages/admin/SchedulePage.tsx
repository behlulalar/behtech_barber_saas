import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarOff, Copy, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { diffDaysISO, formatDate, formatDateShort, fullName, todayLocalISO } from '../../lib/format'
import type { TimeOff, WorkingHour } from '../../types/api'
import { ErrorBlock, hhmm, qk, useStaffList, WEEK_DAYS } from './shared'

type DayDraft = { open: boolean; start: string; end: string }
type WeekDraft = Record<number, DayDraft>

const DEFAULT_START = '09:00'
const DEFAULT_END = '20:00'

function toDraft(hours: WorkingHour[]): WeekDraft {
  const draft: WeekDraft = {}
  for (const d of WEEK_DAYS) draft[d.dow] = { open: false, start: DEFAULT_START, end: DEFAULT_END }
  for (const h of hours) draft[h.day_of_week] = { open: true, start: hhmm(h.start_time), end: hhmm(h.end_time) }
  return draft
}

function serialize(draft: WeekDraft): string {
  return JSON.stringify(WEEK_DAYS.map((d) => (draft[d.dow].open ? [d.dow, draft[d.dow].start, draft[d.dow].end] : [d.dow])))
}

export default function SchedulePage() {
  const { me, isManager } = useStaffAuth()
  const staffQ = useStaffList()
  const [picked, setPicked] = useState('')
  const staffId = isManager ? Number(picked || me?.id || staffQ.data?.[0]?.id || 0) : (me?.id ?? 0)
  const selectedStaff = staffQ.data?.find((s) => s.id === staffId)

  return (
    <>
      <PageHeader
        title="Çalışma Saatleri"
        description="Haftalık mesai ve izin günleri. Müşteriler yalnızca açık günlerde ve izin dışında randevu alabilir."
      />

      {isManager && (
        <div className="mb-6 max-w-sm">
          <Field label="Berber">
            <Select value={staffId ? String(staffId) : ''} onChange={(e) => setPicked(e.target.value)} disabled={!staffQ.data}>
              {(staffQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                  {s.id === me?.id ? ' (siz)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {staffQ.isError ? (
        <ErrorBlock error={staffQ.error} onRetry={() => void staffQ.refetch()} />
      ) : !staffId ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <HoursCard key={`h${staffId}`} staffId={staffId} name={selectedStaff ? fullName(selectedStaff) : ''} />
          <TimeOffCard key={`t${staffId}`} staffId={staffId} />
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Haftalık saatler                                                    */
/* ------------------------------------------------------------------ */

function HoursCard({ staffId, name }: { staffId: number; name: string }) {
  const query = useQuery({ queryKey: [...qk.workingHours, staffId], queryFn: () => adminApi.getWorkingHours(staffId) })
  return (
    <Card>
      <CardHeader title="Haftalık mesai" description={name ? `${name} için açık günler ve saatler` : undefined} />
      {query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading || !query.data ? (
        <div className="flex flex-col gap-2.5" role="status" aria-label="Yükleniyor">
          {WEEK_DAYS.map((d) => (
            <Skeleton key={d.dow} className="h-[4.5rem] w-full" />
          ))}
        </div>
      ) : (
        <HoursEditor staffId={staffId} initial={query.data} />
      )}
    </Card>
  )
}

function HoursEditor({ staffId, initial }: { staffId: number; initial: WorkingHour[] }) {
  const toast = useToast()
  const qc = useQueryClient()
  const baseline = useMemo(() => toDraft(initial), [initial])
  const [draft, setDraft] = useState<WeekDraft>(baseline)

  const dirty = serialize(draft) !== serialize(baseline)
  const openDays = WEEK_DAYS.filter((d) => draft[d.dow].open)
  const invalid = (d: DayDraft) => d.open && (!d.start || !d.end || d.start >= d.end)
  const hasInvalid = WEEK_DAYS.some((d) => invalid(draft[d.dow]))

  function patch(dow: number, p: Partial<DayDraft>) {
    setDraft((cur) => ({ ...cur, [dow]: { ...cur[dow], ...p } }))
  }

  function copyFirstToAll() {
    const first = draft[openDays[0].dow]
    setDraft((cur) => {
      const next = { ...cur }
      for (const d of openDays) next[d.dow] = { open: true, start: first.start, end: first.end }
      return next
    })
    toast.info(`${openDays[0].label} saatleri tüm açık günlere uygulandı. Kaydetmeyi unutmayın.`)
  }

  const save = useMutation({
    mutationFn: () =>
      adminApi.setWorkingHours(
        staffId,
        openDays.map((d) => ({ day_of_week: d.dow, start_time: draft[d.dow].start, end_time: draft[d.dow].end })),
      ),
    onSuccess: (rows) => {
      qc.setQueryData([...qk.workingHours, staffId], rows)
      void qc.invalidateQueries({ queryKey: ['public', 'availability'] })
      toast.success('Çalışma saatleri kaydedildi')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {WEEK_DAYS.map((d) => {
          const v = draft[d.dow]
          const bad = invalid(v)
          return (
            <li key={d.dow} className={cn('rounded-md border px-4 py-1.5', v.open ? 'border-line-strong bg-panel-raised' : 'border-panel-line bg-transparent')}>
              <Switch
                checked={v.open}
                onChange={(open) => patch(d.dow, { open })}
                label={<span className={cn('font-medium', !v.open && 'text-muted-strong')}>{d.label}</span>}
                description={v.open ? undefined : 'Kapalı'}
              />
              {v.open && (
                <div className="pb-3 pt-1">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <Input type="time" step={900} className="px-2.5" value={v.start} invalid={bad} onChange={(e) => patch(d.dow, { start: e.target.value })} aria-label={`${d.label} açılış saati`} />
                    <span className="text-muted" aria-hidden="true">–</span>
                    <Input type="time" step={900} className="px-2.5" value={v.end} invalid={bad} onChange={(e) => patch(d.dow, { end: e.target.value })} aria-label={`${d.label} kapanış saati`} />
                  </div>
                  {bad && (
                    <p role="alert" className="mt-2 text-xs font-medium text-danger">
                      Kapanış saati açılıştan sonra olmalı.
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {openDays.length > 1 ? (
          <Button variant="ghost" onClick={copyFirstToAll} leftIcon={<Copy className="size-4" />}>
            İlk günün saatini herkese uygula
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || hasInvalid}>
          {dirty ? 'Değişiklikleri kaydet' : 'Kaydedildi'}
        </Button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* İzinler                                                             */
/* ------------------------------------------------------------------ */

function rangeLabel(t: TimeOff): string {
  if (t.start_date === t.end_date) return formatDate(t.start_date)
  return `${formatDateShort(t.start_date)} – ${formatDate(t.end_date)}`
}

function TimeOffCard({ staffId }: { staffId: number }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<TimeOff | null>(null)
  const [showPast, setShowPast] = useState(false)
  const query = useQuery({ queryKey: [...qk.timeOff, staffId], queryFn: () => adminApi.listTimeOff(staffId) })
  const today = todayLocalISO()

  const { upcoming, past } = useMemo(() => {
    const all = query.data ?? []
    return {
      upcoming: all.filter((t) => t.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)),
      past: all.filter((t) => t.end_date < today).sort((a, b) => b.start_date.localeCompare(a.start_date)),
    }
  }, [query.data, today])

  const remove = useMutation({
    mutationFn: (t: TimeOff) => adminApi.deleteTimeOff(t.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.timeOff })
      void qc.invalidateQueries({ queryKey: ['public', 'availability'] })
      toast.success('İzin kaldırıldı')
      setDeleting(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDeleting(null)
    },
  })

  const item = (t: TimeOff, muted?: boolean) => {
    const days = diffDaysISO(t.start_date, t.end_date) + 1
    return (
      <li key={t.id} className={cn('flex items-center gap-2 rounded-md border border-panel-line bg-panel-raised py-1.5 pl-4 pr-1.5', muted && 'opacity-60')}>
        <div className="min-w-0 flex-1 py-1.5">
          <p className="text-sm font-medium text-cream">{rangeLabel(t)}</p>
          <p className="truncate text-xs text-muted">
            {days} gün{t.reason ? ` · ${t.reason}` : ''}
          </p>
        </div>
        <IconButton label="İzni kaldır" onClick={() => setDeleting(t)} className="hover:text-danger">
          <Trash2 className="size-[18px]" />
        </IconButton>
      </li>
    )
  }

  return (
    <Card>
      <CardHeader
        title="İzinler"
        description="Bu tarihlerde randevu alınamaz."
        action={
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} leftIcon={<Plus className="size-4" />}>
            İzin ekle
          </Button>
        }
      />
      {query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <div className="flex flex-col gap-2.5" role="status" aria-label="Yükleniyor">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <EmptyState icon={<CalendarOff />} title="Planlı izin yok" description="Tatil ya da izin günü eklediğinizde o tarihler randevuya kapanır." className="py-8" />
      ) : (
        <>
          {upcoming.length === 0 ? <p className="mb-3 text-sm text-muted">Yaklaşan izin yok.</p> : <ul className="flex flex-col gap-2">{upcoming.map((t) => item(t))}</ul>}
          {past.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="flex min-h-11 w-full items-center text-sm font-medium text-muted-strong hover:text-cream"
              >
                {showPast ? 'Geçmiş izinleri gizle' : `Geçmiş izinler (${past.length})`}
              </button>
              {showPast && <ul className="mt-1 flex flex-col gap-2">{past.map((t) => item(t, true))}</ul>}
            </div>
          )}
        </>
      )}

      {adding && <TimeOffForm staffId={staffId} onClose={() => setAdding(false)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        destructive
        title="İzin kaldırılsın mı?"
        description={deleting ? `${rangeLabel(deleting)} tarihleri tekrar randevuya açılacak.` : undefined}
        confirmLabel="Kaldır"
      />
    </Card>
  )
}

function TimeOffForm({ staffId, onClose }: { staffId: number; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const today = todayLocalISO()
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  const dateError = touched && (!start || !end) ? 'Tarihleri seçin.' : touched && start > end ? 'Bitiş, başlangıçtan önce olamaz.' : null

  const save = useMutation({
    mutationFn: () => adminApi.createTimeOff({ staff_id: staffId, start_date: start, end_date: end, reason: reason.trim() || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.timeOff })
      void qc.invalidateQueries({ queryKey: ['public', 'availability'] })
      toast.success('İzin eklendi')
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function submit() {
    setTouched(true)
    if (!start || !end || start > end) return
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!save.isPending}
      size="sm"
      title="İzin ekle"
      description="Tek gün için başlangıç ve bitişi aynı seçin."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Ekle
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlangıç" required>
            <Input
              type="date"
              value={start}
              invalid={Boolean(dateError)}
              onChange={(e) => {
                setStart(e.target.value)
                if (e.target.value > end) setEnd(e.target.value)
              }}
            />
          </Field>
          <Field label="Bitiş" required>
            <Input type="date" min={start} value={end} invalid={Boolean(dateError)} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {dateError && (
          <p role="alert" className="-mt-2 text-xs font-medium text-danger">
            {dateError}
          </p>
        )}
        <Field label="Sebep" hint="İsteğe bağlı not.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="Örn. Yıllık izin" />
        </Field>
      </form>
    </Modal>
  )
}
