import { useMutation } from '@tanstack/react-query'
import { LogOut, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { PasswordHints } from '../../components/ui/PasswordHints'
import { useToast } from '../../components/ui/Toast'
import { ROLE_LABELS } from '../../layouts/AdminLayout'
import { authApi, errorMessage, tokenStore } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { formatPhone, fullName } from '../../lib/format'
import { passwordValid } from '../../lib/passwordPolicy'

export default function AccountPage() {
  const { me, logout } = useStaffAuth()
  const toast = useToast()
  const support = Boolean(me?.impersonated_by)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const change = useMutation({
    mutationFn: () => authApi.changePassword({ current_password: current, new_password: next }),
    onSuccess: (res) => {
      // Eski token artık geçersiz; yenisini saklayınca oturum bu cihazda devam eder.
      tokenStore.set('staff', res.access_token)
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
      toast.success('Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const logoutAll = useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSuccess: () => {
      setConfirmLogout(false)
      logout()
    },
    onError: (err) => {
      setConfirmLogout(false)
      toast.error(errorMessage(err))
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!current) return setError('Mevcut şifrenizi girin.')
    if (!passwordValid(next, me?.phone)) return setError('Yeni şifre kuralları sağlanmıyor.')
    if (next !== confirm) return setError('Yeni şifreler aynı değil.')
    setError(null)
    change.mutate()
  }

  if (!me) return null

  return (
    <>
      <PageHeader title="Hesabım" description="Profiliniz ve güvenlik ayarlarınız." />

      <div className="grid max-w-3xl gap-5">
        <Card>
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={fullName(me)} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-lg text-cream">{fullName(me)}</p>
              <p className="text-sm tabular-nums text-muted">{formatPhone(me.phone)}</p>
              <Badge tone="copper" className="mt-1.5">
                {ROLE_LABELS[me.role]}
              </Badge>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Şifreyi değiştir" description="Değişince diğer cihazlardaki oturumlar kapanır." />
          {support && (
            <p role="status" className="mb-4 flex items-start gap-2 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Destek modundasınız; işletme hesabının şifresi bu modda değiştirilemez.
            </p>
          )}
          <form onSubmit={submit} className="flex max-w-sm flex-col gap-4" noValidate>
            <Field label="Mevcut şifre" required>
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={support} />
            </Field>
            <Field label="Yeni şifre" required>
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={support} />
            </Field>
            <Field label="Yeni şifre (tekrar)" required>
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={support} />
            </Field>
            {!support && <PasswordHints password={next} phone={me.phone} confirm={confirm} />}
            {error && (
              <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" loading={change.isPending} disabled={support || !current || !next || !confirm} className="self-start">
              Şifreyi değiştir
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Oturumlar" description="Telefonunuz kaybolduysa ya da başka bir cihazda açık kaldıysa tüm oturumları kapatın; bu cihazda da yeniden giriş yaparsınız." />
          <Button variant="secondary" onClick={() => setConfirmLogout(true)} disabled={support} leftIcon={<LogOut className="size-4" />}>
            Tüm cihazlardan çıkış
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => logoutAll.mutate()}
        loading={logoutAll.isPending}
        destructive
        title="Tüm cihazlardan çıkış yapılsın mı?"
        description="Hesabınıza bağlı tüm oturumlar kapanır, bu cihazda da yeniden giriş yapmanız gerekir."
        confirmLabel="Tümünden çıkış yap"
      />
    </>
  )
}
