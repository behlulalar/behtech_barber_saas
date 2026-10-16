// Platform yöneticileri için TOTP 2FA: kurulum akışı, yedek kodlar, Hesabım bölümü ve modallar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Checkbox'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/cn'
import { errorMessage, platformApi } from '../../lib/api'
import { usePlatformAuth } from '../../lib/auth'
import type { TwoFactorSetupOut } from '../../types/api'
import { ServerError } from './platformShared'

/** 6 haneli kod alanı (yalnızca rakam, mobilde sayısal klavye). */
export function CodeInput({
  value,
  onChange,
  big,
  autoFocus,
  id,
  ...aria
}: {
  value: string
  onChange: (v: string) => void
  big?: boolean
  autoFocus?: boolean
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  return (
    <Input
      {...aria}
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      autoFocus={autoFocus}
      placeholder="000000"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className={cn('text-center font-mono tabular-nums', big ? 'min-h-14 text-2xl tracking-[0.4em]' : 'tracking-[0.3em]')}
    />
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/* ------------------------------ Yedek kodlar ------------------------------ */

export function BackupCodesView({ codes, onFinish, finishing }: { codes: string[]; onFinish: () => void; finishing?: boolean }) {
  const toast = useToast()
  const [saved, setSaved] = useState(false)

  async function copy() {
    if (await copyText(codes.join('\n'))) toast.success('Kopyalandı')
    else toast.error('Kopyalanamadı')
  }
  function download() {
    const blob = new Blob([`BehTech Randevu - Platform yedek kodları\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'yedek-kodlar.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
        Bu kodlar bir daha gösterilmez. Telefonunuzu kaybederseniz giriş için gerekir.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-md border border-line bg-panel p-4 font-mono text-sm text-cream" aria-label="Yedek kodlar">
        {codes.map((c) => (
          <li key={c} className="break-all text-center tracking-wider">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" leftIcon={<Copy className="size-4" />} onClick={copy}>
          Kopyala
        </Button>
        <Button variant="secondary" leftIcon={<Download className="size-4" />} onClick={download}>
          İndir (.txt)
        </Button>
      </div>
      <Checkbox label="Kodları güvenli bir yere kaydettim" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
      <Button onClick={onFinish} disabled={!saved} loading={finishing}>
        Bitir
      </Button>
    </div>
  )
}

/* ------------------------------ Kurulum akışı ------------------------------ */

function groupSecret(s: string): string {
  return s.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
}

/**
 * 1) şifre -> 2) QR + kod -> 3) yedek kodlar. Bitirilince oturum token'ı tam yetkili olanla değişir
 * (kodlar gösterilirken değiştirilmez; yoksa zorunlu kurulum ekranı kapanıp kodlar kaybolurdu).
 */
export function TwoFactorSetup({ onDone, onCodesShown }: { onDone: () => void; onCodesShown?: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { replaceToken } = usePlatformAuth()
  const [password, setPassword] = useState('')
  const [setup, setSetup] = useState<TwoFactorSetupOut | null>(null)
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ codes: string[]; token: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = useMutation({
    mutationFn: () => platformApi.twoFactor.setup(password),
    onSuccess: (res) => {
      setSetup(res)
      setPassword('')
      setError(null)
    },
    onError: (err) => setError(errorMessage(err)),
  })
  const confirm = useMutation({
    mutationFn: () => platformApi.twoFactor.confirm(code),
    onSuccess: (res) => {
      setResult({ codes: res.backup_codes, token: res.access_token })
      onCodesShown?.()
      setError(null)
    },
    onError: (err) => {
      setCode('')
      setError(errorMessage(err))
    },
  })

  function finish() {
    if (!result) return
    qc.invalidateQueries({ queryKey: ['platform', '2fa'] })
    qc.invalidateQueries({ queryKey: ['platform', 'admins'] })
    replaceToken(result.token)
    toast.success('İki aşamalı doğrulama açıldı')
    onDone()
  }

  if (result) return <BackupCodesView codes={result.codes} onFinish={finish} />

  if (!setup) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (password && !start.isPending) {
            setError(null)
            start.mutate()
          }
        }}
      >
        <p className="text-sm text-muted-strong">Devam etmek için şifrenizi girin. Ardından doğrulayıcı uygulamanızla QR kodu okutacaksınız.</p>
        <Field label="Şifre" required>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </Field>
        <ServerError message={error} />
        <Button type="submit" loading={start.isPending} disabled={!password}>
          Devam
        </Button>
      </form>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (code.length === 6 && !confirm.isPending) confirm.mutate()
      }}
    >
      <p className="text-sm text-muted-strong">Doğrulayıcı uygulamanızla (Google Authenticator, Authy vb.) QR kodu okutun.</p>
      <div className="flex justify-center">
        <img src={setup.qr} alt="2FA QR kodu" width={200} height={200} className="size-[200px] rounded-md bg-white p-2" />
      </div>
      <details className="rounded-md border border-line p-3 text-sm">
        <summary className="min-h-6 cursor-pointer text-muted-strong">Okutamıyorsanız anahtarı elle girin</summary>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="break-all rounded-sm bg-panel px-2 py-1.5 font-mono text-cream">{groupSecret(setup.secret)}</code>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={<Copy className="size-4" />}
            onClick={async () => {
              if (await copyText(setup.secret)) toast.success('Anahtar kopyalandı')
              else toast.error('Kopyalanamadı')
            }}
          >
            Kopyala
          </Button>
        </div>
      </details>
      <Field label="6 haneli kod" required>
        <CodeInput value={code} onChange={setCode} big />
      </Field>
      <ServerError message={error} />
      <Button type="submit" loading={confirm.isPending} disabled={code.length !== 6}>
        Doğrula ve aç
      </Button>
    </form>
  )
}

export function TwoFactorSetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [locked, setLocked] = useState(false)
  if (!open) return null
  return (
    <Modal open onClose={onClose} title="İki aşamalı doğrulamayı etkinleştir" dismissible={!locked}>
      <TwoFactorSetup onDone={onClose} onCodesShown={() => setLocked(true)} />
    </Modal>
  )
}

/* ------------------------------ Şifre + kod gerektiren işlemler ------------------------------ */

function PasswordCodeModal({
  mode,
  onClose,
}: {
  mode: 'disable' | 'backup'
  onClose: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'disable') {
        await platformApi.twoFactor.disable(password, code)
        return null
      }
      return (await platformApi.twoFactor.backupCodes(password, code)).backup_codes
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['platform', '2fa'] })
      qc.invalidateQueries({ queryKey: ['platform', 'admins'] })
      if (res) setCodes(res)
      else {
        toast.success('İki aşamalı doğrulama kapatıldı')
        onClose()
      }
    },
    onError: (err) => {
      setCode('')
      setError(errorMessage(err))
    },
  })

  const disable = mode === 'disable'
  const valid = password.length > 0 && code.length === 6

  if (codes) {
    return (
      <Modal open onClose={() => undefined} dismissible={false} title="Yeni yedek kodlar">
        <BackupCodesView codes={codes} onFinish={onClose} />
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={disable ? 'İki aşamalı doğrulama kapatılsın mı?' : 'Yedek kodları yenile'}
      description={disable ? 'Hesabınız yalnızca şifreyle korunur.' : 'Eski yedek kodlar geçersiz olur.'}
      size="sm"
      dismissible={!mut.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="tf-pc-form" variant={disable ? 'danger' : 'primary'} loading={mut.isPending} disabled={!valid}>
            {disable ? 'Kapat' : 'Yenile'}
          </Button>
        </>
      }
    >
      <form
        id="tf-pc-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && !mut.isPending) {
            setError(null)
            mut.mutate()
          }
        }}
      >
        <Field label="Şifre" required>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </Field>
        <Field label="Doğrulama kodu" required hint="Uygulamadaki 6 haneli kod">
          <CodeInput value={code} onChange={setCode} />
        </Field>
        <ServerError message={error} />
      </form>
    </Modal>
  )
}

/* ------------------------------ Hesabım bölümü ------------------------------ */

export function TwoFactorSection() {
  const status = useQuery({ queryKey: ['platform', '2fa'], queryFn: platformApi.twoFactor.status })
  const [setupOpen, setSetupOpen] = useState(false)
  const [action, setAction] = useState<'disable' | 'backup' | null>(null)
  const d = status.data

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-medium text-cream">İki aşamalı doğrulama</h3>
        {d &&
          (d.enabled ? (
            <Badge tone="success">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Açık
            </Badge>
          ) : (
            <Badge tone="neutral">
              <ShieldOff className="size-3.5" aria-hidden="true" />
              Kapalı
            </Badge>
          ))}
        {d?.required && <Badge tone="copper">Zorunlu</Badge>}
      </div>
      {status.isError ? (
        <ServerError message={errorMessage(status.error)} />
      ) : !d ? (
        <Skeleton className="h-10 w-full" />
      ) : d.enabled ? (
        <div className="flex flex-col gap-3">
          <p className={cn('text-sm', d.backup_codes_remaining <= 3 ? 'text-warning' : 'text-muted-strong')}>
            Kalan yedek kod: {d.backup_codes_remaining}
            {d.backup_codes_remaining <= 3 && ' - azaldı, yenilemenizi öneririz.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setAction('backup')}>
              Yedek kodları yenile
            </Button>
            <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setAction('disable')} disabled={d.required}>
              Kapat
            </Button>
          </div>
          {d.required && <p className="text-xs text-muted">İki aşamalı doğrulama zorunlu olduğu için kapatılamaz.</p>}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-strong">Girişte şifreye ek olarak telefonunuzdaki 6 haneli kod istenir.</p>
          <Button leftIcon={<ShieldCheck className="size-4" />} onClick={() => setSetupOpen(true)}>
            Etkinleştir
          </Button>
        </div>
      )}
      <TwoFactorSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} />
      {action && <PasswordCodeModal key={action} mode={action} onClose={() => setAction(null)} />}
    </div>
  )
}
