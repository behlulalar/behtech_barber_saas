import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Scissors,
  UserRound,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OtpUnavailable } from '../../components/OtpUnavailable'
import { lookupContact, rememberContact } from '../../lib/knownContacts'
import { LIVE_SLOTS_QUERY, useDropStaleSelection } from '../../lib/useLiveSlots'
import { useTenant } from '../../lib/queries'
import { KVKK_REQUIRED_MESSAGE, KvkkCheckbox, useKvkkConsent } from '../../components/KvkkConsent'
import { LoadError } from '../../components/booking/LoadError'
import { TimeStep } from '../../components/booking/TimeStep'
import { AppointmentActions } from '../../components/booking/AppointmentActions'
import { Avatar } from '../../components/ui/Avatar'
import { Button, buttonStyles } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { ApiError, customerApi, errorMessage, publicApi } from '../../lib/api'
import { useCustomerAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import {
  formatDateLong,
  formatDuration,
  formatPrice,
  formatTime,
  formatTimeRange,
  fullName,
  isValidPhone,
  nextDaysISO,
  normalizePhone,
} from '../../lib/format'
import type { AppointmentPublicOut, PublicService, PublicStaff, VerifyCodeResponse } from '../../types/api'
import { OtpCodeForm } from './OtpCodeForm'

type Step = 'service' | 'staff' | 'time' | 'contact' | 'verify' | 'done'

/** "Fark etmez" seçimi (gerçek berber id'leri 1'den başlar). */
const ANY_STAFF = 0

const STEPS: { key: 'service' | 'staff' | 'time' | 'contact'; label: string }[] = [
  { key: 'service', label: 'Hizmet' },
  { key: 'staff', label: 'Berber' },
  { key: 'time', label: 'Zaman' },
  { key: 'contact', label: 'Bilgiler' },
]

const STEP_TITLES: Record<Exclude<Step, 'done'>, { title: string; hint: string }> = {
  service: { title: 'Ne yaptırmak istersiniz?', hint: 'Bir hizmet seçin.' },
  staff: { title: 'Kimden almak istersiniz?', hint: 'Berberinizi seçin.' },
  time: { title: 'Gün ve saat seçin', hint: 'Önümüzdeki 14 gün içinden bir gün seçin.' },
  contact: { title: 'Son bir adım', hint: 'Randevu için iletişim bilgilerinizi girin.' },
  verify: { title: 'Telefonunuzu doğrulayın', hint: 'Randevunuzu onaylamak için kodu girin.' },
}

const DAYS = 14

function stepIndex(step: Step): number {
  if (step === 'verify') return 3
  if (step === 'done') return STEPS.length
  return STEPS.findIndex((s) => s.key === step)
}

export default function BookingPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const auth = useCustomerAuth()
  const days = useMemo(() => nextDaysISO(DAYS), [])

  const [step, setStep] = useState<Step>('service')
  const [serviceId, setServiceId] = useState<number | null>(null)
  const [staffId, setStaffId] = useState<number | null>(null)
  const [date, setDate] = useState<string>(days[0])
  const [time, setTime] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const autoFilledFor = useRef<string | null>(null)
  const [errors, setErrors] = useState<{ name?: string; surname?: string; phone?: string; kvkk?: string }>({})
  const [devCode, setDevCode] = useState<string | null>(null)
  const [result, setResult] = useState<AppointmentPublicOut | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const prefilled = useRef(false)

  const services = useQuery({ queryKey: ['services'], queryFn: publicApi.getServices })
  const staff = useQuery({ queryKey: ['staff'], queryFn: publicApi.getStaff })

  // Ana sayfadaki hizmet kartından gelindiyse (?hizmet=ID) hizmet seçili başlar ve doğrudan berber adımına geçilir.
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkDone = useRef(false)

  const service = services.data?.find((s) => s.id === serviceId) ?? null
  const barber: PublicStaff | null =
    staffId === ANY_STAFF
      ? { id: ANY_STAFF, name: 'Fark', surname: 'etmez', photo_image: null, service_ids: [] }
      : (staff.data?.find((s) => s.id === staffId) ?? null)

  // Seçili hizmeti veren berberler; tek kişi varsa otomatik seçilir.
  const offeringStaff = useMemo(
    () => (serviceId == null ? [] : (staff.data ?? []).filter((p) => p.service_ids.includes(serviceId))),
    [staff.data, serviceId],
  )
  // Hiçbir berberin vermediği hizmetleri listeden gizle (berberler yüklenene kadar hepsi görünür).
  const bookableServices = useMemo(() => {
    const all = services.data ?? []
    if (!staff.data) return all
    return all.filter((s) => staff.data!.some((p) => p.service_ids.includes(s.id)))
  }, [services.data, staff.data])

  useEffect(() => {
    const wanted = Number(searchParams.get('hizmet'))
    if (deepLinkDone.current || !searchParams.has('hizmet') || !services.data || !staff.data) return
    deepLinkDone.current = true
    if (wanted && bookableServices.some((s) => s.id === wanted)) {
      setServiceId(wanted)
      setStep('staff')
    }
    setSearchParams({}, { replace: true }) // adres çubuğu temiz kalsın; geri tuşu akışı bozmasın
  }, [searchParams, services.data, staff.data, bookableServices, setSearchParams])

  useEffect(() => {
    if (step === 'staff' && offeringStaff.length === 1 && staffId !== offeringStaff[0].id) {
      setStaffId(offeringStaff[0].id)
      setTime(null)
    }
  }, [step, offeringStaff, staffId])

  // Oturum varsa telefonu ve kayıtlı adı önceden doldur. Ad yalnızca doğrulama anında değil, sunucudan da okunur:
  // ilk randevusunu aynı oturumda alan müşterinin kaydı doğrulama sırasında henüz yoktu.
  const me = useQuery({ queryKey: ['customer', 'me'], queryFn: customerApi.me, enabled: auth.isAuthenticated, staleTime: 60_000 })
  useEffect(() => {
    if (!auth.isAuthenticated) return
    if (!prefilled.current) {
      prefilled.current = true
      if (auth.phone) setPhone(auth.phone)
    }
    const known = me.data ?? auth.customer
    if (known) {
      // Oturumdan dolan ad da "otomatik" sayılır: kullanıcı başka numara yazarsa temizlenir.
      if (!name && !surname && auth.phone) autoFilledFor.current = auth.phone
      setName((n) => n || known.name)
      setSurname((n) => n || known.surname)
    }
  }, [auth.isAuthenticated, auth.phone, auth.customer, me.data])

  // Numara tam yazılınca, bu cihaz o numarayla daha önce randevu aldıysa ad-soyadı doldur. Başka numara yazılırsa
  // otomatik doldurulan ad temizlenir (kullanıcının kendi yazdığına dokunulmaz).
  useEffect(() => {
    const p = normalizePhone(phone)
    if (autoFilledFor.current && autoFilledFor.current !== p) {
      autoFilledFor.current = null
      setName('')
      setSurname('')
    }
    if (p.length !== 10 || autoFilledFor.current === p) return
    const known = lookupContact(p)
    if (!known || name || surname) return // kullanıcı kendi yazdıysa dokunma
    autoFilledFor.current = p
    setName(known.name)
    setSurname(known.surname)
  }, [phone])

  const availability = useQuery({
    queryKey: ['availability', 'slots', staffId, serviceId, date],
    queryFn: () => publicApi.getSlots({ staff_id: staffId === ANY_STAFF ? undefined : staffId!, service_id: serviceId!, date }),
    enabled: step === 'time' && staffId != null && serviceId != null,
    ...LIVE_SLOTS_QUERY,
    staleTime: 15_000,
  })

  // Yenilemeden sonra seçili başlangıç artık seçilebilir değilse seçimi temizle.
  const slotsData = availability.data
  useEffect(() => {
    if (!time || !slotsData) return
    const slot = slotsData.slots.find((x) => x.start === time.slice(0, 5))
    if (!slot || !slot.bookable) setTime(null)
  }, [slotsData, time])

  // Adım değişince sayfanın üstüne (sayfa içi başlığa) kaydır.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const el = topRef.current
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80
      if (top < window.scrollY) window.scrollTo({ top: Math.max(0, top) })
    }
  }, [step])

  useDropStaleSelection(availability.data, time, () => setTime(null))

  const tenant = useTenant()
  const sessionPhoneMatches = auth.isAuthenticated && auth.phone === normalizePhone(phone)
  const otpBlocked = tenant.data?.otp_available === false && !sessionPhoneMatches

  const create = useMutation({
    mutationFn: () =>
      customerApi.createAppointment({
        name: name.trim(),
        surname: surname.trim(),
        staff_id: staffId === ANY_STAFF ? undefined : staffId!,
        service_id: serviceId!,
        appointment_date: date,
        appointment_time: time!.slice(0, 5),
      }),
    onSuccess: (res) => {
      auth.setCustomer({ name: name.trim(), surname: surname.trim() }) // sonraki "yeni randevu"da ad/soyad dolu gelsin
      if (!lookupContact(normalizePhone(phone))) rememberContact(normalizePhone(phone), name, surname)
      queryClient.invalidateQueries({ queryKey: ['customer', 'me'] })
      setResult(res)
      setStep('done')
      queryClient.invalidateQueries({ queryKey: ['customer', 'appointments'] })
      queryClient.invalidateQueries({ queryKey: ['availability'] })
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setTime(null)
        setStep('time')
        queryClient.invalidateQueries({ queryKey: ['availability'] })
        toast.error(err.detail)
        return
      }
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Oturumunuzun süresi doldu. Lütfen telefonunuzu yeniden doğrulayın.')
        void startVerification()
        return
      }
      // Telefon doğrulandı ama randevu reddedildi (limit vb.): kod formunda takılmasın,
      // bilgi adımına dönsün; oturum geçerli olduğu için tekrar denemek kod istemez.
      if (step === 'verify') setStep('contact')
      toast.error(errorMessage(err))
    },
  })

  const [kvkk, setKvkk] = useKvkkConsent()
  const sendCode = useMutation({
    mutationFn: () => publicApi.sendCode({ phone: normalizePhone(phone), kvkk_accepted: kvkk }),
    onSuccess: (res) => {
      setDevCode(res.dev_code)
      setStep('verify')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function startVerification() {
    sendCode.mutate()
  }

  function validateContact(): boolean {
    const next: typeof errors = {}
    if (name.trim().length < 2) next.name = 'Adınızı girin.'
    if (surname.trim().length < 2) next.surname = 'Soyadınızı girin.'
    if (!isValidPhone(phone)) next.phone = 'Geçerli bir cep telefonu girin (örn. 0555 123 45 67).'
    if (!sessionPhoneMatches && !kvkk) next.kvkk = KVKK_REQUIRED_MESSAGE
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function submitContact(e?: FormEvent) {
    e?.preventDefault()
    if (!validateContact()) return
    if (sessionPhoneMatches) create.mutate()
    else startVerification()
  }

  function onVerified(resp: VerifyCodeResponse) {
    auth.login(resp)
    if (resp.customer) {
      // Numara kayıtlıysa sunucu kayıtlı adı kullanır; farklı bir ad yazıldıysa müşteri sessizce yanıltılmasın.
      if (resp.customer.name.trim() !== name.trim() || resp.customer.surname.trim() !== surname.trim()) {
        toast.warning(`Bu numara ${resp.customer.name} ${resp.customer.surname} adına kayıtlı; randevu bu adla oluşturuldu.`)
      }
      setName(resp.customer.name)
      setSurname(resp.customer.surname)
      rememberContact(normalizePhone(phone), resp.customer.name, resp.customer.surname)
    }
    // Kayıtlı müşteri adı doluysa doğrudan oluştur; token store'a yazıldıktan sonra istek gider.
    create.mutate()
  }

  function back() {
    if (step === 'staff') setStep('service')
    else if (step === 'time') setStep('staff')
    else if (step === 'contact') setStep('time')
    else if (step === 'verify') setStep('contact')
  }

  function next() {
    if (step === 'service' && serviceId != null) setStep('staff')
    else if (step === 'staff' && staffId != null) setStep('time')
    else if (step === 'time' && time) setStep('contact')
  }

  const canNext =
    (step === 'service' && serviceId != null) ||
    (step === 'staff' && staffId != null) ||
    (step === 'time' && time != null)

  if (step === 'done' && result) {
    return <SuccessView appointment={result} name={fullName({ name, surname })} />
  }

  const current = step === 'done' ? 'contact' : step
  const idx = stepIndex(step)

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-6 md:px-10 md:pt-12">
      <div ref={topRef} />
      <StepIndicator index={idx} />

      <header className="mt-7 min-h-[4.5rem] md:mt-10">
        <h1 className="font-display text-[1.75rem] font-medium leading-tight text-cream md:text-4xl">
          {STEP_TITLES[current].title}
        </h1>
        <p className="mt-1.5 text-sm text-muted">{STEP_TITLES[current].hint}</p>
      </header>

      {(service || barber) && step !== 'service' && (
        <SelectionChips service={service} barber={barber} date={step === 'contact' || step === 'verify' ? date : null} time={step === 'contact' || step === 'verify' ? time : null} />
      )}

      <div className="mt-6 pb-8">
        {step === 'service' && (
          <ServiceStep
            loading={services.isLoading}
            error={services.isError}
            items={bookableServices}
            value={serviceId}
            onChange={(id) => {
              if (id !== serviceId) {
                setTime(null)
                const current = staff.data?.find((p) => p.id === staffId)
                if (current && !current.service_ids.includes(id)) setStaffId(null)
              }
              setServiceId(id)
            }}
            onRetry={() => services.refetch()}
          />
        )}

        {step === 'staff' && (
          <StaffStep
            loading={staff.isLoading}
            error={staff.isError}
            items={offeringStaff}
            value={staffId}
            onBackToService={() => setStep('service')}
            onChange={(id) => {
              if (id !== staffId) setTime(null)
              setStaffId(id)
            }}
            onRetry={() => staff.refetch()}
          />
        )}

        {step === 'time' && (
          <TimeStep
            days={days}
            date={date}
            onDate={(d) => {
              setDate(d)
              setTime(null)
            }}
            time={time}
            onTime={setTime}
            data={availability.data}
            loading={availability.isLoading}
            error={availability.isError}
            onRetry={() => availability.refetch()}
          />
        )}

        {step === 'contact' && (
          <form id="contact-form" onSubmit={submitContact} noValidate className="space-y-4">
            <Field
              label="Cep telefonu"
              required
              error={errors.phone}
              hint={
                sessionPhoneMatches
                  ? 'Bu numara doğrulandı, tekrar kod istemeyeceğiz.'
                  : 'Numaranıza bir doğrulama kodu göndereceğiz.'
              }
            >
              <PhoneInput
                autoComplete="tel"
                value={phone}
                onValueChange={setPhone}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ad" required error={errors.name}>
                <Input
                  autoComplete="given-name"
                  autoCapitalize="words"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                />
              </Field>
              <Field label="Soyad" required error={errors.surname}>
                <Input
                  autoComplete="family-name"
                  autoCapitalize="words"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  maxLength={60}
                />
              </Field>
            </div>
            {otpBlocked && <OtpUnavailable info={tenant.data} />}
            {!sessionPhoneMatches && !otpBlocked && (
              <KvkkCheckbox
                checked={kvkk}
                error={errors.kvkk}
                onChange={(v) => {
                  setKvkk(v)
                  if (v) setErrors((e) => ({ ...e, kvkk: undefined }))
                }}
              />
            )}
          </form>
        )}

        {step === 'verify' && (
          <OtpCodeForm
            phone={normalizePhone(phone)}
            initialDevCode={devCode}
            formId="verify-form"
            hideSubmit
            onVerified={onVerified}
            onBack={() => setStep('contact')}
          />
        )}
      </div>

      {/* Sticky eylem çubuğu: mobilde ekranın altında, içerikle birlikte biter. */}
      <div className="pb-safe sticky bottom-0 z-30 -mx-5 border-t border-line bg-ink/95 backdrop-blur-sm md:-mx-10 [@media(min-height:700px)]:md:border-0">
        <div className="mx-auto flex w-full items-center gap-3 px-5 py-3 md:px-10 md:pb-12">
          {step !== 'service' && (
            <Button variant="secondary" size="lg" onClick={back} leftIcon={<ArrowLeft className="size-4" />} aria-label="Geri">
              <span className="hidden sm:inline">Geri</span>
            </Button>
          )}
          <div className="min-w-0 flex-1">
            {step === 'contact' ? (
              <Button
                key="contact-submit"
                type="submit"
                form="contact-form"
                size="lg"
                fullWidth
                loading={create.isPending || sendCode.isPending}
                disabled={otpBlocked}
              >
                {sessionPhoneMatches ? 'Randevuyu onayla' : 'Kod gönder'}
              </Button>
            ) : step === 'verify' ? (
              <Button key="verify-submit" type="submit" form="verify-form" size="lg" fullWidth loading={create.isPending}>
                Doğrula ve onayla
              </Button>
            ) : (
              <Button
                key="next"
                type="button"
                size="lg"
                fullWidth
                disabled={!canNext}
                onClick={next}
                rightIcon={<ArrowRight className="size-4" />}
              >
                {step === 'time' && time ? `${formatTime(time)} için devam et` : 'Devam'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function StepIndicator({ index }: { index: number }) {
  return (
    <nav aria-label="Randevu adımları">
      <ol className="flex items-center">
        {STEPS.map((s, i) => {
          const done = i < index
          const active = i === index
          return (
            <li key={s.key} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')} aria-current={active ? 'step' : undefined}>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                    done && 'border-copper bg-copper text-on-accent',
                    active && 'border-copper text-copper-bright',
                    !done && !active && 'border-line-strong text-muted',
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-xs font-medium tracking-wide',
                    active ? 'text-cream' : 'hidden text-muted sm:inline',
                    done && 'hidden sm:inline',
                  )}
                >
                  {s.label}
                </span>
              </span>
              {i < STEPS.length - 1 && (
                <span className={cn('mx-2 h-px min-w-3 flex-1 sm:mx-3', done ? 'bg-copper' : 'bg-line-strong')} aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function SelectionChips({
  service,
  barber,
  date,
  time,
}: {
  service: PublicService | null
  barber: PublicStaff | null
  date: string | null
  time: string | null
}) {
  const chips = [
    service && { icon: <Scissors className="size-3.5" />, text: service.name },
    barber && { icon: <UserRound className="size-3.5" />, text: fullName(barber) },
    date && time && { icon: <CalendarDays className="size-3.5" />, text: `${formatDateLong(date)} · ${formatTime(time)}` },
  ].filter(Boolean) as { icon: ReactNode; text: string }[]
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <li
          key={i}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs text-muted-strong"
        >
          <span className="shrink-0 text-copper">{c.icon}</span>
          <span className="truncate">{c.text}</span>
        </li>
      ))}
    </ul>
  )
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-[76px] w-full rounded-md" />
      ))}
    </div>
  )
}

const optionBase =
  'group flex w-full min-w-0 items-center gap-4 rounded-md border bg-surface px-4 py-4 text-left transition-colors md:px-5'
const optionState = (selected: boolean) =>
  selected ? 'border-copper bg-surface-raised' : 'border-line hover:border-line-strong active:bg-surface-raised'

function RadioMark({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
        selected ? 'border-copper bg-copper text-on-accent' : 'border-line-strong text-transparent',
      )}
      aria-hidden="true"
    >
      <Check className="size-3.5" />
    </span>
  )
}

function ServiceStep({
  loading,
  error,
  items,
  value,
  onChange,
  onRetry,
}: {
  loading: boolean
  error: boolean
  items: PublicService[]
  value: number | null
  onChange: (id: number) => void
  onRetry: () => void
}) {
  if (loading) return <ListSkeleton rows={4} />
  if (error) return <LoadError onRetry={onRetry} text="Hizmetler yüklenemedi" />
  if (items.length === 0) return <EmptyState icon={<Scissors />} title="Henüz hizmet eklenmemiş" description="Lütfen daha sonra tekrar deneyin." />
  return (
    <div role="radiogroup" aria-label="Hizmet" className="space-y-3">
      {items.map((s) => {
        const selected = s.id === value
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(s.id)}
            className={cn(optionBase, optionState(selected))}
          >
            <RadioMark selected={selected} />
            <span className="min-w-0 flex-1">
              <span className="block break-words font-display text-lg leading-snug text-cream">{s.name}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <Clock className="size-3.5" aria-hidden="true" />
                {formatDuration(s.duration_min)}
              </span>
            </span>
            <span className="shrink-0 font-display text-lg text-copper-bright">{formatPrice(s.price)}</span>
          </button>
        )
      })}
    </div>
  )
}

function StaffStep({
  loading,
  error,
  items,
  value,
  onChange,
  onRetry,
  onBackToService,
}: {
  loading: boolean
  error: boolean
  items: PublicStaff[]
  value: number | null
  onChange: (id: number) => void
  onRetry: () => void
  onBackToService: () => void
}) {
  if (loading) return <ListSkeleton rows={3} />
  if (error) return <LoadError onRetry={onRetry} text="Berberler yüklenemedi" />
  if (items.length === 0)
    return (
      <EmptyState
        icon={<UserRound />}
        title="Bu hizmeti şu an veren berber yok"
        description="Lütfen başka bir hizmet seçin."
        action={
          <Button variant="secondary" onClick={onBackToService} leftIcon={<ArrowLeft className="size-4" />}>
            Hizmetlere dön
          </Button>
        }
      />
    )
  return (
    <div role="radiogroup" aria-label="Berber" className="space-y-3">
      {items.length >= 2 && (
        <button
          type="button"
          role="radio"
          aria-checked={value === ANY_STAFF}
          onClick={() => onChange(ANY_STAFF)}
          className={cn(optionBase, optionState(value === ANY_STAFF))}
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-copper-bright">
            <Users className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-snug text-cream">Fark etmez</span>
            <span className="mt-0.5 block text-xs text-muted">Seçtiğiniz saatte müsait olan berber atanır.</span>
          </span>
          <RadioMark selected={value === ANY_STAFF} />
        </button>
      )}
      {items.map((p) => {
        const selected = p.id === value
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p.id)}
            className={cn(optionBase, optionState(selected))}
          >
            <Avatar name={fullName(p)} src={p.photo_image} size="lg" className={selected ? 'border-copper' : undefined} />
            <span className="min-w-0 flex-1 break-words font-display text-lg leading-snug text-cream">{fullName(p)}</span>
            <RadioMark selected={selected} />
          </button>
        )
      })}
    </div>
  )
}

function SuccessView({ appointment, name }: { appointment: AppointmentPublicOut; name: string }) {
  const rows = [
    { label: 'Hizmet', value: appointment.service.name },
    { label: 'Berber', value: fullName(appointment.staff) },
    { label: 'Tarih', value: formatDateLong(appointment.appointment_date) },
    { label: 'Saat', value: formatTimeRange(appointment.appointment_time, appointment.service.duration_min) },
    { label: 'Ücret', value: formatPrice(appointment.service.price) },
  ]
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10 md:px-10 md:py-16">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full border border-copper text-copper-bright">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-display text-3xl font-medium text-cream md:text-4xl">Randevunuz alındı</h1>
        <p className="mt-2 text-sm text-muted">
          {name ? `Teşekkürler ${name.split(' ')[0]}, ` : ''}sizi bekliyoruz.
        </p>
      </div>

      <dl className="mt-8 divide-y divide-line rounded-md border border-line bg-surface">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
            <dt className="shrink-0 text-sm text-muted">{r.label}</dt>
            <dd className="min-w-0 break-words text-right font-display text-base text-cream">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-center text-xs text-muted">
        Randevunuz onaylandı. Başka bir cihazdan görmek ya da iptal etmek için sitedeki “Giriş yap” bağlantısından telefon numaranızla giriş yapın; numaranıza doğrulama kodu göndereceğiz.
      </p>

      <AppointmentActions appointment={appointment} size="lg" className="mt-6 justify-center [&>*]:flex-1 sm:[&>*]:flex-none" />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link to="/randevularim" className={buttonStyles({ size: 'lg', fullWidth: true })}>
          Randevularım
        </Link>
        <Link to="/" className={buttonStyles({ variant: 'secondary', size: 'lg', fullWidth: true })}>
          Ana sayfa
        </Link>
      </div>
    </div>
  )
}
