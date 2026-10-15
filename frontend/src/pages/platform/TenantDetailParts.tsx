import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound, MessageCircle, Pencil, ScrollText } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Skeleton } from '../../components/ui/Skeleton'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { formatPhone, formatTimestamp, isValidPhone, normalizePhone } from '../../lib/format'
import type { PlatformTenantDetail } from '../../types/api'
import { SetupList } from './SetupParts'

const NOTE_MAX = 2000

/* ------------------------------ Kurulum ------------------------------ */

export function SetupCard({ tenant }: { tenant: PlatformTenantDetail }) {
  const setup = tenant.setup
  if (!setup) return null
  return (
    <Card>
      <CardHeader title="Kurulum durumu" description="Müşterilerin randevu alabilmesi için gerekenler." />
      {setup.ready && (
        <p role="status" className="mb-3 rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
          Hazır: müşteriler bu işletmeden randevu alabilir.
        </p>
      )}
      <SetupList setup={setup} />
    </Card>
  )
}

/* ------------------------------ Not ------------------------------ */

export function NoteCard({ tenant }: { tenant: PlatformTenantDetail }) {
  const qc = useQueryClient()
  const toast = useToast()
  const saved = tenant.note ?? ''
  const [text, setText] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const dirty = text.trim() !== saved

  const save = useMutation({
    mutationFn: () => platformApi.updateTenant(tenant.id, { note: text.trim() }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      setText(t.note ?? '')
      setError(null)
      toast.success('Not kaydedildi')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <Card>
      <CardHeader title="İşletme notu" description="Yalnızca platform yöneticileri görür; işletmeye gösterilmez." />
      <Field label="Not" error={error} hint={`${text.length} / ${NOTE_MAX}`}>
        <Textarea rows={4} maxLength={NOTE_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Örn. Eylülde 6 aylık paket konuşuldu." />
      </Field>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
          Kaydet
        </Button>
        <span className="text-sm text-muted" aria-live="polite">
          {dirty ? 'Kaydedilmemiş değişiklik var' : saved ? 'Kaydedildi' : ''}
        </span>
      </div>
    </Card>
  )
}

/* ------------------------------ Sahip ------------------------------ */

function OwnerEditModal({ tenant, onClose }: { tenant: PlatformTenantDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const o = tenant.owner!
  const [name, setName] = useState(o.name)
  const [surname, setSurname] = useState(o.surname)
  const [phone, setPhone] = useState(o.phone)
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const errors = {
    name: name.trim() ? null : 'Ad gerekli.',
    surname: surname.trim() ? null : 'Soyad gerekli.',
    phone: isValidPhone(phone) ? null : 'Geçerli bir telefon girin (5XXXXXXXXX).',
  }
  const hasError = Object.values(errors).some(Boolean)

  const mutation = useMutation({
    mutationFn: () => {
      const body: { name?: string; surname?: string; phone?: string } = {}
      if (name.trim() !== o.name) body.name = name.trim()
      if (surname.trim() !== o.surname) body.surname = surname.trim()
      if (normalizePhone(phone) !== o.phone) body.phone = normalizePhone(phone)
      return platformApi.updateOwner(tenant.id, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform'] })
      toast.success('Sahip bilgisi güncellendi')
      onClose()
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (!hasError) mutation.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="sm"
      title="Sahip bilgisini düzenle"
      description="Telefon değişirse sahibin açık oturumları kapanır."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="owner-edit-form" loading={mutation.isPending}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="owner-edit-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pb-2">
        <Field label="Ad" required error={touched ? errors.name : null}>
          <Input data-autofocus autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Soyad" required error={touched ? errors.surname : null}>
          <Input autoComplete="off" value={surname} onChange={(e) => setSurname(e.target.value)} />
        </Field>
        <Field label="Telefon" required error={touched ? errors.phone : null} hint="Panele bu numara ile giriş yapılır.">
          <PhoneInput autoComplete="off" value={phone} onValueChange={setPhone} />
        </Field>
        {serverError && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  )
}

function TempPasswordModal({ tenant, password, onClose }: { tenant: PlatformTenantDetail; password: string; onClose: () => void }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const o = tenant.owner!

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Kopyalanamadı, şifreyi elle seçip kopyalayın')
    }
  }

  const message =
    `Merhaba ${o.name}, ${tenant.name} yönetim paneliniz için geçici şifreniz hazır.\n` +
    `Giriş adresi: https://${tenant.slug}.behtechlabs.com/panel/giris\n` +
    `Telefon: ${formatPhone(o.phone)}\n` +
    `Geçici şifre: ${password}`
  const waUrl = `https://wa.me/90${o.phone}?text=${encodeURIComponent(message)}`

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Geçici şifre oluşturuldu"
      footer={
        <>
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line-strong px-4 text-sm font-medium text-cream hover:bg-cream/5"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            WhatsApp ile gönder
          </a>
          <Button onClick={onClose}>Kapat</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Bu şifre bir daha gösterilmez. Kapatmadan önce kopyalayın ya da sahibe gönderin.
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-3 text-center font-mono text-xl tracking-wider break-all text-cream select-all">
            {password}
          </code>
          <Button variant="secondary" onClick={copy} leftIcon={copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}>
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </Button>
        </div>
        <p className="text-sm text-muted">Sahibin açık oturumları kapatıldı; yeni şifreyle giriş yapması gerekir.</p>
      </div>
    </Modal>
  )
}

export function OwnerCard({ tenant }: { tenant: PlatformTenantDetail }) {
  const qc = useQueryClient()
  const toast = useToast()
  const o = tenant.owner
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  const reset = useMutation({
    mutationFn: () => platformApi.resetOwnerPassword(tenant.id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['platform', 'audit'] })
      setConfirming(false)
      setTempPassword(r.password)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setConfirming(false)
    },
  })

  return (
    <Card>
      <CardHeader title="Sahip" description="İşletme panelinin ilk yöneticisi." />
      {!o ? (
        <p className="text-sm text-muted">Bu işletmede sahip hesabı yok.</p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Ad Soyad</dt>
            <dd className="min-w-0 break-words text-cream">{o.name} {o.surname}</dd>
            <dt className="text-muted">Telefon</dt>
            <dd className="tabular-nums text-cream">{formatPhone(o.phone)}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" leftIcon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Düzenle
            </Button>
            <Button variant="secondary" leftIcon={<KeyRound className="size-4" />} onClick={() => setConfirming(true)}>
              Şifreyi sıfırla
            </Button>
          </div>
        </>
      )}
      {editing && o && <OwnerEditModal tenant={tenant} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => reset.mutate()}
        destructive
        loading={reset.isPending}
        title="Sahibin şifresi sıfırlansın mı?"
        confirmLabel="Şifreyi sıfırla"
        description={
          <>
            <strong className="text-cream">{o?.name} {o?.surname}</strong> için yeni bir geçici şifre oluşturulacak ve açık oturumları kapatılacak. Eski şifre artık çalışmaz.
          </>
        }
      />
      {tempPassword && o && <TempPasswordModal tenant={tenant} password={tempPassword} onClose={() => setTempPassword(null)} />}
    </Card>
  )
}

/* ------------------------------ Son olaylar ------------------------------ */

export function RecentEventsCard({ tenantId }: { tenantId: number }) {
  const q = useQuery({
    queryKey: ['platform', 'audit', 'tenant', tenantId],
    queryFn: () => platformApi.listAudit({ tenant_id: tenantId, limit: 10 }),
  })
  return (
    <Card>
      <CardHeader
        title="Son olaylar"
        action={
          <Link to="/platform/denetim" className="inline-flex min-h-11 items-center text-sm font-medium text-copper-bright hover:underline">
            Tümünü gör
          </Link>
        }
      />
      {q.isLoading ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Yükleniyor">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-danger">{errorMessage(q.error)}</p>
      ) : (q.data?.items.length ?? 0) === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ScrollText className="size-4" aria-hidden="true" /> Bu işletme için kayıtlı olay yok.
        </p>
      ) : (
        <ul className="divide-y divide-panel-line">
          {q.data!.items.map((e) => (
            <li key={e.id} className="py-2.5">
              <p className="break-words text-sm text-cream">{e.summary}</p>
              <p className="text-xs text-muted">
                {formatTimestamp(e.created_at)} · {e.actor_label}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
