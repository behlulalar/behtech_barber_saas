import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff, BellRing, CircleCheck, CircleX, Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { getExistingSubscription, pushSupport, subscribeToPush, unsubscribeFromPush } from '../../lib/push'
import type { PlatformSettingsOut } from '../../types/api'
import { formatIban, renderTemplate, SAMPLE_VARS, TEMPLATE_VARS } from './billing'

/* ------------------------------ Şablon editörü ------------------------------ */

function TemplateEditor({
  label,
  value,
  onChange,
  error,
  vars,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string | null
  vars: Record<string, string>
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function insert(key: string) {
    const el = ref.current
    const token = `{${key}}`
    if (!el) return onChange(value + token)
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    onChange(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Field label={label} error={error}>
        {(a11y) => <Textarea {...a11y} ref={ref} rows={6} value={value} onChange={(e) => onChange(e.target.value)} maxLength={2000} />}
      </Field>
      <div className="flex flex-wrap gap-1.5" aria-label="Değişkenler">
        {TEMPLATE_VARS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => insert(v.key)}
            aria-label={`${v.label} değişkenini ekle`}
            className="inline-flex min-h-11 items-center rounded-xs border border-line-strong px-2.5 font-mono text-xs text-muted-strong transition-colors hover:border-copper hover:text-copper-bright active:bg-copper/10 md:pointer-fine:min-h-8"
          >
            {`{${v.key}}`}
          </button>
        ))}
      </div>
      <div className="rounded-md border border-panel-line bg-ink/60 p-3">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted">Önizleme</p>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-strong">{renderTemplate(value, vars) || '—'}</p>
      </div>
    </div>
  )
}

/* ------------------------------ Bildirimler ------------------------------ */

type PushState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'

function Notifications({ pushConfigured }: { pushConfigured: boolean }) {
  const toast = useToast()
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const sup = pushSupport()
      if (!sup.ok) return setState(sup.reason === 'ios-needs-install' ? 'ios-install' : 'unsupported')
      if (Notification.permission === 'denied') return setState('denied')
      const sub = await getExistingSubscription().catch(() => null)
      if (!cancelled) setState(sub && Notification.permission === 'granted' ? 'on' : 'off')
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const { public_key } = await platformApi.getPushPublicKey()
      if (!public_key) {
        toast.error('Sunucuda bildirim anahtarları tanımlı değil.')
        return
      }
      const body = await subscribeToPush(public_key)
      await platformApi.pushSubscribe(body)
      setState('on')
      toast.success('Bu cihazda bildirimler açıldı')
    } catch (err) {
      if (err instanceof Error && err.message === 'permission-denied') {
        setState('denied')
      } else if (err instanceof Error && err.message.startsWith('permission-')) {
        toast.info('Bildirim izni verilmedi.')
      } else {
        toast.error(errorMessage(err, 'Bildirimler açılamadı. Lütfen tekrar deneyin.'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const endpoint = await unsubscribeFromPush()
      if (endpoint) await platformApi.pushUnsubscribe(endpoint)
      setState('off')
      toast.success('Bu cihazda bildirimler kapatıldı')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true)
    try {
      const r = await platformApi.pushTest()
      if (r.sent > 0) toast.success(`Test bildirimi ${r.sent} cihaza gönderildi`)
      else toast.error('Bildirim gönderilemedi: kayıtlı cihaz yok.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  let note: string | null = null
  if (!pushConfigured) note = 'Sunucuda bildirim anahtarları (VAPID) tanımlı değil; bildirim gönderilemez.'
  else if (state === 'ios-install') note = "iPhone/iPad'de bildirim için uygulamayı yüklemelisiniz: Safari'de Paylaş → Ana Ekrana Ekle, sonra uygulamayı oradan açın."
  else if (state === 'unsupported') note = 'Bu tarayıcı bildirimleri desteklemiyor.'
  else if (state === 'denied') note = 'Bildirim izni engellenmiş. Tarayıcı/site ayarlarından bildirimlere izin verip sayfayı yenileyin.'

  return (
    <Card>
      <CardHeader
        title="Bildirimler"
        description="Yaklaşan ve geciken ödemeler için bu cihaza anlık bildirim gönderilir."
        action={state === 'on' ? <Badge tone="success">Bu cihazda açık</Badge> : undefined}
      />
      {note && <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {state === 'on' ? (
          <>
            <Button variant="secondary" leftIcon={<BellOff className="size-4" />} onClick={disable} loading={busy}>
              Kapat
            </Button>
            <Button variant="secondary" leftIcon={<Send className="size-4" />} onClick={sendTest} loading={busy}>
              Test bildirimi gönder
            </Button>
          </>
        ) : (
          <Button leftIcon={<BellRing className="size-4" />} onClick={enable} loading={busy} disabled={!pushConfigured || state === 'loading' || state === 'unsupported' || state === 'ios-install' || state === 'denied'}>
            Bu cihazda bildirimleri aç
          </Button>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------ Form ------------------------------ */

function Indicator({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />}
      <div className="min-w-0">
        <p className="text-cream">
          {label} <span className={ok ? 'text-success' : 'text-muted'}>{ok ? 'yapılandırıldı' : 'yapılandırılmadı'}</span>
        </p>
        {!ok && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  )
}

function SettingsForm({ data }: { data: PlatformSettingsOut }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [iban, setIban] = useState(formatIban(data.iban))
  const [holder, setHolder] = useState(data.account_holder ?? '')
  const [bank, setBank] = useState(data.bank_name ?? '')
  const [reminderDays, setReminderDays] = useState(String(data.reminder_days))
  const [graceDays, setGraceDays] = useState(String(data.grace_days))
  const [email, setEmail] = useState(data.notify_email ?? '')
  const [reminderTpl, setReminderTpl] = useState(data.reminder_template)
  const [overdueTpl, setOverdueTpl] = useState(data.overdue_template)
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const rd = Number(reminderDays)
  const gd = Number(graceDays)
  const cleanIban = iban.replace(/\s+/g, '').toUpperCase()
  const errors = {
    iban: cleanIban && !/^TR\d{24}$/.test(cleanIban) ? 'IBAN "TR" ile başlamalı ve 24 rakam içermeli.' : null,
    rd: !Number.isInteger(rd) || rd < 1 || rd > 30 ? '1 ile 30 arasında olmalı.' : null,
    gd: !Number.isInteger(gd) || gd < 0 || gd > 60 ? '0 ile 60 arasında olmalı.' : null,
    email: email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Geçerli bir e-posta girin.' : null,
  }
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null)

  const vars: Record<string, string> = {
    ...SAMPLE_VARS,
    ...(cleanIban ? { iban: formatIban(cleanIban) } : {}),
    ...(holder.trim() ? { alici: holder.trim() } : {}),
    ...(bank.trim() ? { banka: bank.trim() } : {}),
    kalan_gun: String(rd || 3),
  }

  const mutation = useMutation({
    mutationFn: () =>
      platformApi.updateSettings({
        iban: cleanIban || null,
        account_holder: holder.trim() || null,
        bank_name: bank.trim() || null,
        reminder_days: rd,
        grace_days: gd,
        notify_email: email.trim() || null,
        reminder_template: reminderTpl,
        overdue_template: overdueTpl,
      }),
    onSuccess: (s) => {
      qc.setQueryData(['platform', 'settings'], s)
      qc.invalidateQueries({ queryKey: ['platform', 'billing'] })
      setIban(formatIban(s.iban))
      toast.success('Ayarlar kaydedildi')
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (Object.values(errors).some(Boolean)) return
    mutation.mutate()
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Ödeme bilgileri" description="Mesaj şablonlarında {iban}, {alici} ve {banka} olarak kullanılır." />
          <div className="flex flex-col gap-4">
            <Field label="IBAN" error={show('iban')} hint="Boşluklar otomatik düzenlenir.">
              <Input autoComplete="off" autoCapitalize="characters" spellCheck={false} value={iban} onChange={(e) => setIban(e.target.value)} onBlur={() => setIban(formatIban(iban))} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Alıcı adı">
                <Input autoComplete="off" value={holder} onChange={(e) => setHolder(e.target.value)} />
              </Field>
              <Field label="Banka">
                <Input autoComplete="off" value={bank} onChange={(e) => setBank(e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Takip kuralları" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Hatırlatma günü" error={show('rd')} hint="Bitişe bu kadar gün kala “yaklaşan” sayılır.">
              <Input inputMode="numeric" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
            </Field>
            <Field label="Ek süre (gün)" error={show('gd')} hint="Bitişten sonra bu kadar gün beklenir, sonra işletme askıya alınır.">
              <Input inputMode="numeric" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
            </Field>
            <Field label="Bildirim e-postası" error={show('email')} className="sm:col-span-2" hint="Günlük özet bu adrese gönderilir.">
              <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-panel-line pt-4">
            <Indicator ok={data.email_configured} label="E-posta (SMTP)" hint="Sunucu .env dosyasında SMTP ayarları tanımlı değil." />
            <Indicator ok={data.push_configured} label="Anlık bildirim (VAPID)" hint="Sunucu .env dosyasında VAPID anahtarları tanımlı değil." />
          </div>
        </Card>

        <Card>
          <CardHeader title="WhatsApp mesaj şablonları" description="Değişken eklemek için etiketlere dokunun; önizleme örnek verilerle çizilir." />
          <div className="flex flex-col gap-8">
            <TemplateEditor label="Hatırlatma (süresi yaklaşan / aktif)" value={reminderTpl} onChange={setReminderTpl} vars={vars} />
            <TemplateEditor label="Gecikmiş (ek süre / süresi dolmuş)" value={overdueTpl} onChange={setOverdueTpl} vars={vars} />
          </div>
        </Card>

        {serverError && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {serverError}
          </p>
        )}
        <div>
          <Button type="submit" loading={mutation.isPending}>
            Ayarları kaydet
          </Button>
        </div>
      </form>

      <Notifications pushConfigured={data.push_configured} />
    </div>
  )
}

export default function SettingsPage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['platform', 'settings'], queryFn: platformApi.getSettings })
  return (
    <>
      <PageHeader eyebrow="Platform" title="Ayarlar" description="Ödeme bilgileri, takip kuralları, mesaj şablonları ve bildirimler." />
      {isLoading ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Yükleniyor">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : isError || !data ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {errorMessage(error)}
        </p>
      ) : (
        <SettingsForm data={data} />
      )}
    </>
  )
}
