import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { customerApi, errorMessage, publicApi } from '../../lib/api'
import { useCustomerAuth } from '../../lib/auth'
import {
  formatDateLong,
  formatDuration,
  formatPrice,
  formatTime,
  formatWeekdayShort,
  isValidPhone,
  nextDaysISO,
  normalizePhone,
  parseISODateLocal,
  todayLocalISO,
} from '../../lib/format'
import { staffImageFor } from '../../lib/placeholderImages'
import type { PublicService as Service, PublicStaff as Staff } from '../../types/api'

type Step = 'service' | 'staff' | 'time' | 'contact' | 'verify' | 'confirm' | 'done'

const STEP_ORDER: Step[] = ['service', 'staff', 'time', 'contact', 'verify', 'confirm']
const STEP_LABELS: Record<Step, string> = {
  service: 'Hizmet',
  staff: 'Usta',
  time: 'Saat',
  contact: 'İletişim',
  verify: 'Doğrulama',
  confirm: 'Onay',
  done: 'Tamam',
}

export default function BookingPage() {
  const customerAuth = useCustomerAuth()
  const [searchParams] = useSearchParams()
  const preselectedStaffId = searchParams.get('staff')

  const [step, setStep] = useState<Step>('service')
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayLocalISO())
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: publicApi.getServices })
  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: publicApi.getStaff })

  const availabilityQuery = useQuery({
    queryKey: ['availability', selectedStaff?.id, selectedService?.id, selectedDate],
    queryFn: () => publicApi.getAvailability({ staff_id: selectedStaff!.id, service_id: selectedService!.id, date: selectedDate }),
    enabled: step === 'time' && !!selectedStaff && !!selectedService,
  })

  const sendCodeMutation = useMutation({
    mutationFn: () => publicApi.sendCode({ phone: normalizePhone(phone) }),
    onSuccess: (data) => {
      setDevCode(data.dev_code)
      setError(null)
      setStep('verify')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const verifyCodeMutation = useMutation({
    mutationFn: () => publicApi.verifyCode({ phone: normalizePhone(phone), code }),
    onSuccess: (res) => {
      customerAuth.login(res)
      if (res.customer && !name) setName(res.customer.name)
      if (res.customer && !surname) setSurname(res.customer.surname)
      setError(null)
      setStep('confirm')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const createAppointmentMutation = useMutation({
    mutationFn: () =>
      customerApi.createAppointment({
        name,
        surname,
        staff_id: selectedStaff!.id,
        service_id: selectedService!.id,
        appointment_date: selectedDate,
        appointment_time: selectedTime!,
      }),
    onSuccess: () => {
      setError(null)
      setStep('done')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const days = useMemo(() => nextDaysISO(14), [])
  const currentIndex = STEP_ORDER.indexOf(step)

  function goBack() {
    setError(null)
    if (currentIndex > 0) setStep(STEP_ORDER[currentIndex - 1])
  }

  return (
    <div className="text-cream">
      {step !== 'done' && (
        <div className="hidden items-center justify-center gap-2 border-b border-line py-4 md:flex">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className={`flex items-center gap-2 text-xs ${i <= currentIndex ? 'text-copper' : 'text-muted'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${i <= currentIndex ? 'border-copper' : 'border-line-strong'}`}>
                {i + 1}
              </span>
              {STEP_LABELS[s]}
              {i < STEP_ORDER.length - 1 && <span className="mx-1 text-line-strong">—</span>}
            </div>
          ))}
        </div>
      )}

      <div className="mx-auto max-w-2xl px-5 py-10 md:py-16">
        {step !== 'service' && step !== 'done' && (
          <button
            type="button"
            onClick={goBack}
            className="mb-8 text-sm font-medium text-muted-strong hover:text-cream"
          >
            ← Geri
          </button>
        )}

        {error && (
          <div className="mb-6 rounded border border-copper/40 bg-copper/10 px-4 py-3 text-sm text-copper-bright">
            {error}
          </div>
        )}

        {step === 'service' && (
          <section>
            <h1 className="font-display text-3xl font-medium">Hangi hizmeti istiyorsunuz?</h1>
            <div className="mt-8 flex flex-col gap-3">
              {servicesQuery.data?.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => {
                    setSelectedService(service)
                    setStep(preselectedStaffId ? 'time' : 'staff')
                    if (preselectedStaffId && staffQuery.data) {
                      const found = staffQuery.data.find((s) => s.id === Number(preselectedStaffId))
                      if (found) setSelectedStaff(found)
                    }
                  }}
                  className="flex items-center justify-between rounded border border-line bg-surface px-6 py-5 text-left hover:border-copper"
                >
                  <div>
                    <div className="font-display text-lg font-medium">{service.name}</div>
                    <div className="mt-1 text-sm text-muted">{formatDuration(service.duration_min)}</div>
                  </div>
                  <div className="font-display text-xl font-semibold text-copper">{formatPrice(service.price)}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 'staff' && (
          <section>
            <h1 className="font-display text-3xl font-medium">Ustanızı seçin.</h1>
            <div className="mt-8 flex flex-col gap-3">
              {staffQuery.data?.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => {
                    setSelectedStaff(member)
                    setStep('time')
                  }}
                  className="flex items-center gap-4 rounded border border-line bg-surface px-6 py-5 text-left hover:border-copper"
                >
                  <div className="h-12 w-12 overflow-hidden rounded-full">
                    <img
                      src={staffImageFor(member.id)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="font-display text-lg font-medium">
                    {member.name} {member.surname}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 'time' && (
          <section>
            <h1 className="font-display text-3xl font-medium">Tarih ve saat seçin.</h1>

            <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
              {days.map((day) => {
                const d = parseISODateLocal(day)
                const isSelected = day === selectedDate
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day)
                      setSelectedTime(null)
                    }}
                    className={`flex min-w-16 flex-col items-center rounded border px-3 py-3 ${
                      isSelected ? 'border-copper bg-copper text-ink' : 'border-line bg-surface text-cream'
                    }`}
                  >
                    <span className="text-[11px] uppercase">
                      {formatWeekdayShort(day)}
                    </span>
                    <span className="mt-1 font-display text-lg font-medium">{d.getDate()}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-8">
              {availabilityQuery.isLoading && <p className="text-muted">Müsait saatler yükleniyor…</p>}
              {availabilityQuery.data?.length === 0 && (
                <p className="text-muted">Bu tarihte müsait saat yok, başka bir gün deneyin.</p>
              )}
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {availabilityQuery.data?.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setSelectedTime(time)}
                    className={`rounded border px-3 py-2 text-sm ${
                      selectedTime === time
                        ? 'border-copper bg-copper text-ink'
                        : 'border-line bg-surface text-cream hover:border-copper'
                    }`}
                  >
                    {formatTime(time)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!selectedTime}
              onClick={() => setStep('contact')}
              className="mt-10 w-full rounded-sm bg-copper py-4 text-sm font-semibold text-ink hover:bg-copper-bright disabled:cursor-not-allowed disabled:opacity-40"
            >
              Devam Et
            </button>
          </section>
        )}

        {step === 'contact' && (
          <section>
            <h1 className="font-display text-3xl font-medium">İletişim bilgileriniz.</h1>
            <form
              className="mt-8 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!isValidPhone(phone)) {
                  setError('Geçerli bir telefon numarası girin (5XXXXXXXXX).')
                  return
                }
                sendCodeMutation.mutate()
              }}
            >
              <input
                type="text"
                required
                placeholder="Ad"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-copper focus:outline-none"
              />
              <input
                type="text"
                required
                placeholder="Soyad"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="rounded border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-copper focus:outline-none"
              />
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                placeholder="Telefon (5XXXXXXXXX)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded border border-line bg-surface px-4 py-3 text-cream placeholder:text-muted focus:border-copper focus:outline-none"
              />
              <button
                type="submit"
                disabled={sendCodeMutation.isPending}
                className="mt-4 w-full rounded-sm bg-copper py-4 text-sm font-semibold text-ink hover:bg-copper-bright disabled:opacity-60"
              >
                {sendCodeMutation.isPending ? 'Gönderiliyor…' : 'Doğrulama Kodu Gönder'}
              </button>
            </form>
          </section>
        )}

        {step === 'verify' && (
          <section>
            <h1 className="font-display text-3xl font-medium">Telefonunuzu doğrulayın.</h1>
            <p className="mt-3 text-muted">{phone} numarasına gönderilen kodu girin.</p>
            {devCode && (
              <p className="mt-2 text-xs text-copper">
                (Geliştirme modu — kod: {devCode})
              </p>
            )}
            <form
              className="mt-8 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                verifyCodeMutation.mutate()
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                placeholder="6 haneli kod"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded border border-line bg-surface px-4 py-3 text-center font-display text-2xl tracking-[8px] text-cream placeholder:text-muted focus:border-copper focus:outline-none"
              />
              <button
                type="submit"
                disabled={verifyCodeMutation.isPending}
                className="mt-4 w-full rounded-sm bg-copper py-4 text-sm font-semibold text-ink hover:bg-copper-bright disabled:opacity-60"
              >
                {verifyCodeMutation.isPending ? 'Doğrulanıyor…' : 'Doğrula'}
              </button>
            </form>
          </section>
        )}

        {step === 'confirm' && (
          <section>
            <h1 className="font-display text-3xl font-medium">Randevunuzu onaylayın.</h1>
            <div className="mt-8 flex flex-col gap-4 rounded border border-line bg-surface p-6">
              <SummaryRow label="Hizmet" value={selectedService?.name ?? ''} />
              <SummaryRow label="Usta" value={`${selectedStaff?.name} ${selectedStaff?.surname}`} />
              <SummaryRow
                label="Tarih"
                value={formatDateLong(selectedDate)}
              />
              <SummaryRow label="Saat" value={selectedTime ? formatTime(selectedTime) : ''} />
              <SummaryRow label="Ücret" value={formatPrice(selectedService?.price ?? 0)} />
            </div>
            <button
              type="button"
              disabled={createAppointmentMutation.isPending}
              onClick={() => createAppointmentMutation.mutate()}
              className="mt-8 w-full rounded-sm bg-copper py-4 text-sm font-semibold text-ink hover:bg-copper-bright disabled:opacity-60"
            >
              {createAppointmentMutation.isPending ? 'Oluşturuluyor…' : 'Randevuyu Onayla'}
            </button>
          </section>
        )}

        {step === 'done' && (
          <section className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-copper text-copper">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="mt-6 font-display text-3xl font-medium">Randevunuz alındı!</h1>
            <p className="mt-3 text-muted">
              {selectedService?.name} — {selectedStaff?.name} {selectedStaff?.surname} ·{' '}
              {formatDateLong(selectedDate)} · {selectedTime ? formatTime(selectedTime) : ''}
            </p>
            <Link
              to="/"
              className="mt-10 inline-block rounded-sm border border-line-strong px-8 py-4 text-sm font-semibold text-cream hover:border-copper"
            >
              Ana Sayfaya Dön
            </Link>
          </section>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-4 last:border-0 last:pb-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-display text-base font-medium">{value}</span>
    </div>
  )
}
