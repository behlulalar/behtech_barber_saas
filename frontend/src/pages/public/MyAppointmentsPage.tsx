import { OtpUnavailable } from '../../components/OtpUnavailable'
import { useTenant } from '../../lib/queries'
import { KVKK_REQUIRED_MESSAGE, KvkkCheckbox, useKvkkConsent } from '../../components/KvkkConsent'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, LogOut, Phone, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, buttonStyles } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/Badge'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { customerApi, errorMessage, publicApi } from '../../lib/api'
import { useCustomerAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import {
  appointmentStart,
  formatDateLong,
  formatPhone,
  formatPrice,
  formatTimeRange,
  fullName,
  isValidPhone,
  normalizePhone,
  parseISODateLocal,
} from '../../lib/format'
import type { AppointmentPublicOut, VerifyCodeResponse } from '../../types/api'
import { OtpCodeForm } from './OtpCodeForm'

const MONTH = new Intl.DateTimeFormat('tr-TR', { month: 'short' })

export default function MyAppointmentsPage() {
  const auth = useCustomerAuth()
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 md:px-10 md:py-14">
      {auth.isAuthenticated ? <AppointmentList /> : <LoginPanel />}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function LoginPanel() {
  const auth = useCustomerAuth()
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ phone: string; devCode: string | null } | null>(null)
  const tenant = useTenant()
  const otpBlocked = tenant.data?.otp_available === false
  const [kvkk, setKvkk] = useKvkkConsent()
  const [kvkkError, setKvkkError] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: (p: string) => publicApi.sendCode({ phone: p, kvkk_accepted: kvkk }),
    onSuccess: (res, p) => {
      auth.clearExpired()
      setPending({ phone: p, devCode: res.dev_code })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!isValidPhone(phone)) {
      setError('Geçerli bir cep telefonu girin (örn. 0555 123 45 67).')
      return
    }
    if (!kvkk) {
      setKvkkError(KVKK_REQUIRED_MESSAGE)
      return
    }
    setError(null)
    setKvkkError(null)
    send.mutate(normalizePhone(phone))
  }

  return (
    <div className="mx-auto max-w-md">
      <p className="eyebrow">Müşteri girişi</p>
      <h1 className="mt-3 font-display text-[1.9rem] font-medium leading-tight text-cream md:text-4xl">
        Randevularınızı görmek için giriş yapın
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Daha önce randevu aldıysanız aynı telefon numarasını yazın; numaranıza tek kullanımlık bir doğrulama kodu gönderelim.
        Şifre ya da üyelik gerekmez. Giriş yaptıktan sonra randevularınızı görebilir ve iptal edebilirsiniz.
      </p>

      {auth.expired && !pending && (
        <div className="mt-5 flex items-start gap-2.5 rounded-sm border border-warning/40 bg-warning/5 px-3.5 py-3 text-sm text-warning" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Oturumunuzun süresi doldu. Devam etmek için telefonunuzu yeniden doğrulayın.
        </div>
      )}

      <div className="mt-7 rounded-md border border-line bg-surface p-5 md:p-6">
        {pending ? (
          <OtpCodeForm
            phone={pending.phone}
            initialDevCode={pending.devCode}
            onBack={() => setPending(null)}
            onVerified={(r: VerifyCodeResponse) => auth.login(r)}
            submitLabel="Giriş yap"
          />
        ) : (
          <form onSubmit={submit} noValidate className="space-y-5">
            <Field label="Cep telefonu" error={error}>
              <PhoneInput
                autoComplete="tel"
                leading={<Phone className="size-4" />}
                value={phone}
                onValueChange={setPhone}
              />
            </Field>
            {otpBlocked && <OtpUnavailable info={tenant.data} />}
            {!otpBlocked && <KvkkCheckbox
              checked={kvkk}
              error={kvkkError}
              onChange={(v) => {
                setKvkk(v)
                if (v) setKvkkError(null)
              }}
            />}
            <Button type="submit" size="lg" fullWidth loading={send.isPending} disabled={otpBlocked}>
              Kod gönder
            </Button>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Henüz randevunuz yok mu?{' '}
        <Link to="/randevu" className="text-copper-bright underline-offset-4 hover:underline">
          Randevu alın
        </Link>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function AppointmentList() {
  const auth = useCustomerAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<AppointmentPublicOut | null>(null)

  const query = useQuery({
    queryKey: ['customer', 'appointments', auth.phone],
    queryFn: customerApi.listAppointments,
  })

  const cancel = useMutation({
    mutationFn: (id: number) => customerApi.cancelAppointment(id),
    onSuccess: () => {
      toast.success('Randevunuz iptal edildi')
      setTarget(null)
      queryClient.invalidateQueries({ queryKey: ['customer', 'appointments'] })
      queryClient.invalidateQueries({ queryKey: ['availability'] })
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setTarget(null)
    },
  })

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const up: AppointmentPublicOut[] = []
    const pa: AppointmentPublicOut[] = []
    for (const a of query.data ?? []) {
      const active = a.status === 'confirmed'
      const future = appointmentStart(a.appointment_date, a.appointment_time).getTime() >= now
      if (active && future) up.push(a)
      else pa.push(a)
    }
    up.sort(
      (x, y) =>
        appointmentStart(x.appointment_date, x.appointment_time).getTime() -
        appointmentStart(y.appointment_date, y.appointment_time).getTime(),
    )
    return { upcoming: up, past: pa }
  }, [query.data])

  const greeting = auth.customer?.name

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow">Randevularım</p>
          <h1 className="mt-3 break-words font-display text-[1.9rem] font-medium leading-tight text-cream md:text-4xl">
            {greeting ? `Merhaba ${greeting}` : 'Randevularınız'}
          </h1>
          {auth.phone && <p className="mt-1.5 text-sm text-muted">{formatPhone(auth.phone)}</p>}
        </div>
        <Button variant="ghost" size="sm" leftIcon={<LogOut className="size-4" />} onClick={auth.logout}>
          Çıkış yap
        </Button>
      </div>

      {query.isLoading && (
        <div className="mt-8 space-y-3" role="status" aria-label="Yükleniyor">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[132px] w-full rounded-md" />
          ))}
        </div>
      )}

      {query.isError && (
        <EmptyState
          className="mt-6"
          title="Randevular yüklenemedi"
          description={errorMessage(query.error)}
          action={
            <Button variant="secondary" onClick={() => query.refetch()}>
              Tekrar dene
            </Button>
          }
        />
      )}

      {query.isSuccess && query.data.length === 0 && (
        <EmptyState
          className="mt-6 rounded-md border border-dashed border-line-strong"
          icon={<CalendarPlus />}
          title="Henüz randevunuz yok"
          description="İlk randevunuzu birkaç dokunuşla oluşturabilirsiniz."
          action={
            <Link to="/randevu" className={buttonStyles({ size: 'lg' })}>
              Randevu al
            </Link>
          }
        />
      )}

      {query.isSuccess && query.data.length > 0 && (
        <>
          <section className="mt-9" aria-labelledby="up-h">
            <h2 id="up-h" className="mb-4 font-display text-xl text-cream">
              Yaklaşan <span className="text-muted">({upcoming.length})</span>
            </h2>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-start gap-4 rounded-md border border-dashed border-line-strong p-5">
                <p className="text-sm text-muted">Yaklaşan randevunuz bulunmuyor.</p>
                <Link to="/randevu" className={buttonStyles({ size: 'md' })}>
                  Randevu al
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((a) => (
                  <AppointmentCard key={a.id} a={a} onCancel={() => setTarget(a)} />
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-10" aria-labelledby="past-h">
              <h2 id="past-h" className="mb-4 font-display text-xl text-cream">
                Geçmiş <span className="text-muted">({past.length})</span>
              </h2>
              <ul className="space-y-3">
                {past.map((a) => (
                  <AppointmentCard key={a.id} a={a} muted />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ConfirmDialog
        open={target != null}
        onClose={() => !cancel.isPending && setTarget(null)}
        onConfirm={() => target && cancel.mutate(target.id)}
        title="Randevuyu iptal et"
        description={
          target
            ? `${formatDateLong(target.appointment_date)} saat ${target.appointment_time.slice(0, 5)} tarihli ${target.service.name} randevunuz iptal edilecek. Randevuya 2 saatten az kala iptal yapılamaz.`
            : undefined
        }
        confirmLabel="Randevuyu iptal et"
        cancelLabel="Vazgeç"
        destructive
        loading={cancel.isPending}
      />
    </>
  )
}

function AppointmentCard({ a, onCancel, muted }: { a: AppointmentPublicOut; onCancel?: () => void; muted?: boolean }) {
  const d = parseISODateLocal(a.appointment_date)
  return (
    <li
      className={cn(
        'flex min-w-0 gap-4 rounded-md border border-line bg-surface p-4 md:gap-5 md:p-5',
        muted && 'opacity-80',
      )}
    >
      <div
        className={cn(
          'flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-sm border md:h-[72px] md:w-16',
          muted ? 'border-line-strong text-muted-strong' : 'border-copper/60 text-copper-bright',
        )}
        aria-hidden="true"
      >
        <span className="font-display text-2xl leading-none md:text-3xl">{d.getDate()}</span>
        <span className="mt-1 text-xs font-medium uppercase tracking-wider">{MONTH.format(d)}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <h3 className="min-w-0 break-words font-display text-lg leading-snug text-cream">{a.service.name}</h3>
          <StatusBadge status={a.status} />
        </div>
        <p className="mt-1 text-sm text-muted-strong">
          {formatDateLong(a.appointment_date)} · {formatTimeRange(a.appointment_time, a.service.duration_min)}
        </p>
        <p className="mt-0.5 break-words text-sm text-muted">
          {fullName(a.staff)} · {formatPrice(a.service.price)}
        </p>
        {onCancel && (
          <Button variant="danger" size="sm" className="mt-3" onClick={onCancel}>
            İptal et
          </Button>
        )}
      </div>
    </li>
  )
}
