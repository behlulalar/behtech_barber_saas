// Randevu satırı, durum/ödeme alt sayfası ve elle randevu oluşturma (Genel Bakış + Randevular ortak).
import { SlotGrid, SlotGridSkeleton } from '../../components/booking/SlotGrid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Phone, RotateCcw, UserX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, buttonStyles } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatusBadge } from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage, publicApi } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import {
  formatDateLong,
  formatPhone,
  formatPrice,
  formatTime,
  formatTimeRange,
  fullName,
  isValidPhone,
  normalizePhone,
  todayLocalISO,
} from '../../lib/format'
import type { AdminAppointmentOut, AdminAppointmentUpdate, AppointmentStatus } from '../../types/api'
import { qk, telHref, useServiceList, usePaymentMethodList, useStaffList } from './shared'

/* ------------------------------------------------------------------ */
/* Güncelleme mutasyonu                                                */
/* ------------------------------------------------------------------ */

export function useUpdateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AdminAppointmentUpdate }) => adminApi.updateAppointment(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.appointments })
      void qc.invalidateQueries({ queryKey: qk.dashboard })
      void qc.invalidateQueries({ queryKey: qk.reports })
    },
  })
}

/* ------------------------------------------------------------------ */
/* Akış: satırdan hızlı eylem + alt sayfa                              */
/* ------------------------------------------------------------------ */

export type QuickAction = 'complete' | 'no_show' | 'cancel'
type Step = 'details' | 'complete' | 'no_show' | 'cancel'

const DONE_MESSAGES: Record<AppointmentStatus, string> = {
  confirmed: 'Randevu geri alındı',
  completed: 'Randevu tamamlandı',
  cancelled: 'Randevu iptal edildi',
  no_show: 'Gelmedi olarak işaretlendi',
}

export function useAppointmentFlow() {
  const [state, setState] = useState<{ appt: AdminAppointmentOut; step: Step } | null>(null)
  const mutation = useUpdateAppointment()
  const toast = useToast()

  function setStatus(appt: AdminAppointmentOut, status: AppointmentStatus, paymentMethod?: string | null) {
    const data: AdminAppointmentUpdate = { status }
    if (paymentMethod !== undefined) data.payment_method = paymentMethod
    mutation.mutate(
      { id: appt.id, data },
      {
        onSuccess: () => {
          toast.success(DONE_MESSAGES[status])
          setState(null)
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    )
  }

  function open(appt: AdminAppointmentOut, step: Step = 'details') {
    setState({ appt, step })
  }

  function quick(appt: AdminAppointmentOut, action: QuickAction) {
    open(appt, action)
  }

  const element = state ? (
    <AppointmentSheet
      key={`${state.appt.id}`}
      appt={state.appt}
      initialStep={state.step}
      busy={mutation.isPending}
      onClose={() => setState(null)}
      onSetStatus={(status, pm) => setStatus(state.appt, status, pm)}
      onSetPayment={(pm) => {
        mutation.mutate(
          { id: state.appt.id, data: { payment_method: pm } },
          {
            onSuccess: () => {
              toast.success('Ödeme yöntemi kaydedildi')
              setState(null)
            },
            onError: (err) => toast.error(errorMessage(err)),
          },
        )
      }}
    />
  ) : null

  return { open, quick, element, busyId: mutation.isPending ? mutation.variables?.id : undefined }
}

/* ------------------------------------------------------------------ */
/* Satır                                                               */
/* ------------------------------------------------------------------ */

interface RowProps {
  appt: AdminAppointmentOut
  showStaff: boolean
  showDate?: boolean
  flow: ReturnType<typeof useAppointmentFlow>
}

export function AppointmentRow({ appt, showStaff, showDate, flow }: RowProps) {
  const dim = appt.status === 'cancelled' || appt.status === 'no_show'
  const hasActions = appt.status === 'confirmed'
  const endTime = formatTimeRange(appt.appointment_time, appt.service.duration_min).split(' – ')[1]

  // Kartın KENDİ genişliğine göre (@container) iki yerleşim:
  //  dar: saat | müşteri+hizmet, altında durum, en altta eşit üç düğme;
  //  geniş: tek satır, sabit sütunlar → tüm kartlarda saat, müşteri, durum ve düğmeler aynı hizada.
  return (
    <div className={cn('@container rounded-md border border-panel-line bg-panel', dim && 'opacity-70')}>
      <div className="@5xl:flex @5xl:items-stretch">
        <button
          type="button"
          onClick={() => flow.open(appt)}
          className="grid w-full min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 p-4 text-left active:bg-panel-hover @5xl:flex-1 @5xl:grid-cols-[4.5rem_minmax(0,1fr)_13rem] @5xl:gap-y-0"
          aria-label={`${fullName(appt.customer)}, ${formatTime(appt.appointment_time)}, detaylar`}
        >
          <div className="row-span-2 self-start @5xl:row-span-1 @5xl:self-center">
            <p className="whitespace-nowrap font-display text-2xl font-medium leading-none tabular-nums text-cream">{formatTime(appt.appointment_time)}</p>
            <p className="mt-1.5 whitespace-nowrap text-xs tabular-nums text-muted">– {endTime}</p>
          </div>

          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={cn('min-w-0 truncate font-medium text-cream', dim && 'line-through decoration-muted/60')}>{fullName(appt.customer)}</p>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted @5xl:hidden" aria-hidden="true" />
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-strong">
              {appt.service.name} · {formatPrice(appt.service.price)}
            </p>
          </div>

          <div className="col-start-2 flex min-w-0 items-center justify-between gap-2 @5xl:col-start-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge status={appt.status} />
              {showStaff && <span className="truncate text-xs text-muted">{fullName(appt.staff)}</span>}
              {showDate && <span className="text-xs text-muted">{formatDateLong(appt.appointment_date)}</span>}
              {appt.status === 'completed' && appt.payment_method && <span className="text-xs text-muted">{appt.payment_method}</span>}
            </div>
            <ChevronRight className="hidden size-4 shrink-0 text-muted @5xl:block" aria-hidden="true" />
          </div>
        </button>

        {hasActions && (
          <div className="grid grid-cols-3 gap-2 border-t border-panel-line p-2 @5xl:w-[25rem] @5xl:shrink-0 @5xl:items-center @5xl:border-l @5xl:border-t-0 @5xl:p-3">
            <Button size="sm" variant="primary" className="w-full px-2" onClick={() => flow.quick(appt, 'complete')} leftIcon={<Check className="size-4" />}>
              Tamamla
            </Button>
            <Button size="sm" variant="secondary" className="w-full px-2" onClick={() => flow.quick(appt, 'no_show')} leftIcon={<UserX className="size-4" />}>
              Gelmedi
            </Button>
            <Button size="sm" variant="danger" className="w-full px-2" onClick={() => flow.quick(appt, 'cancel')} aria-label="Randevuyu iptal et" leftIcon={<X className="size-4" />}>
              İptal
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Alt sayfa                                                           */
/* ------------------------------------------------------------------ */

interface SheetProps {
  appt: AdminAppointmentOut
  initialStep: Step
  busy: boolean
  onClose: () => void
  onSetStatus: (status: AppointmentStatus, paymentMethod?: string | null) => void
  onSetPayment: (paymentMethod: string | null) => void
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm text-cream">{children}</dd>
    </div>
  )
}

function AppointmentSheet({ appt, initialStep, busy, onClose, onSetStatus, onSetPayment }: SheetProps) {
  const [step, setStep] = useState<Step>(initialStep)
  const methods = usePaymentMethodList()
  const [payment, setPayment] = useState<string>(appt.payment_method ?? '')
  const isCompleted = appt.status === 'completed'

  const options = useMemo(() => {
    const names = (methods.data ?? []).filter((m) => m.is_active).map((m) => m.name)
    if (appt.payment_method && !names.includes(appt.payment_method)) names.unshift(appt.payment_method)
    return names
  }, [methods.data, appt.payment_method])

  /* --- Ödeme adımı --- */
  if (step === 'complete') {
    const editing = isCompleted
    return (
      <Modal
        open
        onClose={onClose}
        dismissible={!busy}
        size="sm"
        title={editing ? 'Ödeme yöntemi' : 'Randevuyu tamamla'}
        description={`${fullName(appt.customer)} · ${appt.service.name} · ${formatPrice(appt.service.price)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => (initialStep === 'details' || editing ? setStep('details') : onClose())} disabled={busy}>
              Geri
            </Button>
            <Button
              loading={busy}
              onClick={() => (editing ? onSetPayment(payment || null) : onSetStatus('completed', payment || null))}
              data-autofocus
            >
              {editing ? 'Kaydet' : 'Tamamla'}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted-strong">Ödeme nasıl alındı?</p>
        {methods.isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <div role="radiogroup" aria-label="Ödeme yöntemi" className="grid grid-cols-2 gap-2 pb-2">
            {options.map((name) => (
              <ChoiceChip key={name} active={payment === name} onClick={() => setPayment(name)}>
                {name}
              </ChoiceChip>
            ))}
            <ChoiceChip active={payment === ''} onClick={() => setPayment('')}>
              Belirtme
            </ChoiceChip>
          </div>
        )}
      </Modal>
    )
  }

  /* --- İptal / gelmedi onayı --- */
  if (step === 'cancel' || step === 'no_show') {
    const cancel = step === 'cancel'
    return (
      <Modal
        open
        onClose={onClose}
        dismissible={!busy}
        size="sm"
        title={cancel ? 'Randevu iptal edilsin mi?' : 'Gelmedi olarak işaretlensin mi?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => (initialStep === 'details' ? setStep('details') : onClose())} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={busy} onClick={() => onSetStatus(cancel ? 'cancelled' : 'no_show')} data-autofocus>
              {cancel ? 'İptal et' : 'Gelmedi'}
            </Button>
          </>
        }
      >
        <p className="pb-2 text-sm leading-relaxed text-muted-strong">
          {fullName(appt.customer)}, {formatDateLong(appt.appointment_date)} saat {formatTime(appt.appointment_time)}.{' '}
          {cancel ? 'Saat tekrar müsait görünür.' : 'Müşteri kaydında gelmedi olarak görünür.'}
        </p>
      </Modal>
    )
  }

  /* --- Detay --- */
  const canFinish = appt.status === 'confirmed'
  const canReopen = appt.status === 'cancelled' || appt.status === 'no_show' || isCompleted

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      title={fullName(appt.customer)}
      description={<StatusBadge status={appt.status} />}
      footer={
        <a href={telHref(appt.customer.phone)} className={buttonStyles({ variant: 'secondary', fullWidth: true })}>
          <Phone className="size-4" aria-hidden="true" />
          {formatPhone(appt.customer.phone)}
        </a>
      }
    >
      <dl className="divide-y divide-panel-line">
        <InfoRow label="Tarih">{formatDateLong(appt.appointment_date)}</InfoRow>
        <InfoRow label="Saat">{formatTimeRange(appt.appointment_time, appt.service.duration_min)}</InfoRow>
        <InfoRow label="Hizmet">
          {appt.service.name} · {formatPrice(appt.service.price)}
        </InfoRow>
        <InfoRow label="Berber">{fullName(appt.staff)}</InfoRow>
        {isCompleted && <InfoRow label="Ödeme">{appt.payment_method ?? 'Belirtilmedi'}</InfoRow>}
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2 pb-3">
        {canFinish && (
          <Button variant="primary" className="col-span-2" onClick={() => setStep('complete')} leftIcon={<Check className="size-4" />}>
            Tamamla
          </Button>
        )}
        {canFinish && (
          <Button variant="secondary" onClick={() => setStep('no_show')} leftIcon={<UserX className="size-4" />}>
            Gelmedi
          </Button>
        )}
        {canFinish && (
          <Button variant="danger" className="col-span-2" onClick={() => setStep('cancel')} leftIcon={<X className="size-4" />}>
            Randevuyu iptal et
          </Button>
        )}
        {isCompleted && (
          <Button variant="secondary" className="col-span-2" onClick={() => setStep('complete')}>
            Ödeme yöntemini değiştir
          </Button>
        )}
        {canReopen && (
          <Button variant="ghost" className="col-span-2" loading={busy} onClick={() => onSetStatus('confirmed')} leftIcon={<RotateCcw className="size-4" />}>
            {isCompleted ? 'Tamamlandıyı geri al' : 'Randevuyu geri al'}
          </Button>
        )}
      </div>
    </Modal>
  )
}

function ChoiceChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'min-h-12 rounded-sm border px-3 text-sm font-medium transition-colors',
        active ? 'border-copper bg-copper/15 text-copper-bright' : 'border-line-strong text-cream hover:border-copper/60',
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Elle randevu (yüz yüze gelen müşteri / telefon)                     */
/* ------------------------------------------------------------------ */

export interface NewAppointmentPrefill {
  phone?: string
  name?: string
  surname?: string
  /** Tablodan boş saate dokunulunca: personel, tarih ve başlangıç saati ("HH:MM"). */
  staffId?: number
  date?: string
  time?: string
}

interface NewProps {
  open: boolean
  onClose: () => void
  defaultDate: string
  prefill?: NewAppointmentPrefill | null
  onCreated: (appt: AdminAppointmentOut) => void
}

export function NewAppointmentModal(props: NewProps) {
  // Modal kapalıyken hiçbir sorgu/state tutma; açılınca temiz başla.
  if (!props.open) return null
  return <NewAppointmentForm {...props} />
}

function NewAppointmentForm({ onClose, defaultDate, prefill, onCreated }: NewProps) {
  const { me, isManager } = useStaffAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const staffQ = useStaffList()
  const servicesQ = useServiceList()

  const [phone, setPhone] = useState(prefill?.phone ? formatPhone(prefill.phone) : '')
  const [name, setName] = useState(prefill?.name ?? '')
  const [surname, setSurname] = useState(prefill?.surname ?? '')
  const [serviceId, setServiceId] = useState('')
  const [staffId, setStaffId] = useState(
    isManager ? (prefill?.staffId ? String(prefill.staffId) : '') : String(me?.id ?? ''),
  )
  const startDate = prefill?.date ?? defaultDate
  const [date, setDate] = useState(startDate < todayLocalISO() ? todayLocalISO() : startDate)
  // Tablodan gelen saat, kullanıcı elle saat seçene kadar korunur (seçilebilir değilse aşağıdaki kontrol temizler).
  const preselectedTime = useRef(prefill?.time ?? '')
  const [time, setTime] = useState(prefill?.time ?? '')
  const [touched, setTouched] = useState(false)

  const services = useMemo(() => (servicesQ.data ?? []).filter((s) => s.is_active), [servicesQ.data])
  const staff = staffQ.data ?? []

  // Yönetici için varsayılan berber: kendisi (listede varsa), yoksa ilk kişi.
  useEffect(() => {
    if (staffId || !staff.length) return
    const mine = staff.find((s) => s.id === me?.id)
    setStaffId(String((mine ?? staff[0]).id))
  }, [staff, staffId, me?.id])

  const phoneNorm = normalizePhone(phone)
  const phoneOk = isValidPhone(phone)

  // Kayıtlı müşteriyi telefondan bul, ad/soyad boşsa doldur.
  const lookup = useQuery({
    queryKey: [...qk.customers, 'lookup', phoneNorm],
    queryFn: () => adminApi.listCustomers(phoneNorm),
    enabled: phoneOk,
    staleTime: 30_000,
  })
  const known = phoneOk ? lookup.data?.find((c) => c.phone === phoneNorm) : undefined
  useEffect(() => {
    if (known && !name && !surname) {
      setName(known.name)
      setSurname(known.surname)
    }
  }, [known, name, surname])

  const slotsEnabled = Boolean(serviceId && staffId && date)
  const slots = useQuery({
    queryKey: ['public', 'availability', 'slots', staffId, serviceId, date],
    queryFn: () => publicApi.getSlots({ staff_id: Number(staffId), service_id: Number(serviceId), date }),
    enabled: slotsEnabled,
    staleTime: 15_000,
  })
  useEffect(() => {
    setTime(preselectedTime.current)
  }, [serviceId, staffId, date])
  // Yenilemeden sonra seçili başlangıç artık seçilebilir değilse temizle.
  const slotsData = slots.data
  useEffect(() => {
    if (!time || !slotsData) return
    const slot = slotsData.slots.find((x) => x.start === time)
    if (!slot || !slot.bookable) setTime('')
  }, [slotsData, time])

  const create = useMutation({
    mutationFn: () =>
      adminApi.createAppointment({
        phone: phoneNorm,
        name: name.trim(),
        surname: surname.trim(),
        staff_id: Number(staffId),
        service_id: Number(serviceId),
        appointment_date: date,
        appointment_time: time,
      }),
    onSuccess: (appt) => {
      void qc.invalidateQueries({ queryKey: qk.appointments })
      void qc.invalidateQueries({ queryKey: qk.dashboard })
      void qc.invalidateQueries({ queryKey: qk.reports })
      void qc.invalidateQueries({ queryKey: qk.customers })
      toast.success('Randevu oluşturuldu')
      onCreated(appt)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      void slots.refetch()
    },
  })

  const errors = {
    phone: touched && !phoneOk ? 'Geçerli bir telefon girin (5XX XXX XX XX).' : null,
    name: touched && !name.trim() ? 'Ad gerekli.' : null,
    surname: touched && !surname.trim() ? 'Soyad gerekli.' : null,
    service: touched && !serviceId ? 'Hizmet seçin.' : null,
    time: touched && !time ? 'Saat seçin.' : null,
  }

  function submit() {
    setTouched(true)
    if (!phoneOk || !name.trim() || !surname.trim() || !serviceId || !staffId || !date || !time) return
    create.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!create.isPending}
      title="Yeni randevu"
      description="Yüz yüze ya da telefonla gelen müşteri için."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Vazgeç
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Randevu oluştur
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 pb-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        noValidate
      >
        <Field label="Telefon" required error={errors.phone} hint={known ? `Kayıtlı müşteri: ${fullName(known)}` : undefined}>
          <PhoneInput autoComplete="off" value={phone} onValueChange={setPhone} data-autofocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ad" required error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Soyad" required error={errors.surname}>
            <Input value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label="Hizmet" required error={errors.service}>
          <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">{servicesQ.isLoading ? 'Yükleniyor…' : 'Seçin'}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatPrice(s.price)} · {s.duration_min} dk
              </option>
            ))}
          </Select>
        </Field>
        {isManager && (
          <Field label="Berber" required>
            <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Tarih" required>
          <Input type="date" min={todayLocalISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Saat" required error={errors.time}>
          {(a11y) => (
            <div id={a11y.id} aria-describedby={a11y['aria-describedby']}>
              {!slotsEnabled ? (
                <p className="rounded-sm border border-dashed border-line px-3 py-3 text-sm text-muted">Önce hizmet ve tarih seçin.</p>
              ) : slots.isLoading ? (
                <SlotGridSkeleton maxColumns={3} />
              ) : slots.isError || !slots.data ? (
                <p className="text-sm text-danger">{errorMessage(slots.error)}</p>
              ) : (
                <SlotGrid
                  data={slots.data}
                  value={time || null}
                  onChange={(t) => {
                    preselectedTime.current = ''
                    setTime(t)
                  }}
                  maxColumns={3}
                />
              )}
            </div>
          )}
        </Field>
      </form>
    </Modal>
  )
}
