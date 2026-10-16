// Yöneticiler sayfası modalları: şifre değiştir, yönetici ekle, şifre sıfırla.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { isValidPhone } from '../../lib/format'
import type { PlatformAdmin } from '../../types/api'
import { checkPassword, PasswordHints, ServerError } from './platformShared'

/** Yeni şifre + tekrar alanları; geçerlilik üst bileşene bildirilir. */
function NewPasswordFields({
  value,
  confirm,
  onValue,
  onConfirm,
  phone,
  label = 'Yeni şifre',
}: {
  value: string
  confirm: string
  onValue: (v: string) => void
  onConfirm: (v: string) => void
  phone?: string | null
  label?: string
}) {
  const mismatch = confirm.length > 0 && confirm !== value
  return (
    <>
      <Field label={label} required>
        <Input type="password" autoComplete="new-password" value={value} onChange={(e) => onValue(e.target.value)} />
      </Field>
      <PasswordHints password={value} phone={phone} />
      <Field label="Yeni şifre (tekrar)" required error={mismatch ? 'Şifreler eşleşmiyor' : undefined}>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} invalid={mismatch} />
      </Field>
    </>
  )
}

/* ------------------------------ Şifreyi değiştir ------------------------------ */

export function ChangePasswordModal({ open, onClose, phone }: { open: boolean; onClose: () => void; phone: string }) {
  return open ? <ChangePasswordBody onClose={onClose} phone={phone} /> : null
}

function ChangePasswordBody({ onClose, phone }: { onClose: () => void; phone: string }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const valid = current.length > 0 && checkPassword(next, phone).valid && next === confirm

  const mut = useMutation({
    mutationFn: () => platformApi.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      toast.success('Şifre değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.')
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || mut.isPending) return
    setError(null)
    mut.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Şifreyi değiştir"
      description="Başarılı olursa bu cihaz açık kalır, diğer tüm cihazların oturumu kapanır."
      dismissible={!mut.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="change-password-form" loading={mut.isPending} disabled={!valid}>
            Şifreyi değiştir
          </Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Mevcut şifre" required>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-autofocus />
        </Field>
        <NewPasswordFields value={next} confirm={confirm} onValue={setNext} onConfirm={setConfirm} phone={phone} />
        <ServerError message={error} />
      </form>
    </Modal>
  )
}

/* ------------------------------ Yönetici ekle ------------------------------ */

export function AddAdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <AddAdminBody onClose={onClose} /> : null
}

function AddAdminBody({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const phoneOk = isValidPhone(phone)
  const valid = phoneOk && checkPassword(password, phone).valid && password === confirm

  const mut = useMutation({
    mutationFn: () => platformApi.createAdmin({ phone, name: name.trim() || null, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'admins'] })
      toast.success('Yönetici eklendi')
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || mut.isPending) return
    setError(null)
    mut.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Yönetici ekle"
      description="Yeni yönetici platformun tüm alanlarına erişir."
      dismissible={!mut.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="add-admin-form" loading={mut.isPending} disabled={!valid}>
            Yönetici ekle
          </Button>
        </>
      }
    >
      <form id="add-admin-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Cep telefonu" required hint="5XXXXXXXXX" error={phone.length === 10 && !phoneOk ? 'Geçerli bir cep telefonu girin' : undefined}>
          <PhoneInput value={phone} onValueChange={setPhone} autoComplete="off" data-autofocus />
        </Field>
        <Field label="Ad (isteğe bağlı)">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="off" />
        </Field>
        <NewPasswordFields value={password} confirm={confirm} onValue={setPassword} onConfirm={setConfirm} phone={phone} label="Şifre" />
        <ServerError message={error} />
      </form>
    </Modal>
  )
}

/* ------------------------------ Yönetici düzenle ------------------------------ */

export function EditAdminModal({ admin, onClose }: { admin: PlatformAdmin | null; onClose: () => void }) {
  return admin ? <EditAdminBody key={admin.id} admin={admin} onClose={onClose} /> : null
}

function EditAdminBody({ admin, onClose }: { admin: PlatformAdmin; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [phone, setPhone] = useState(admin.phone)
  const [name, setName] = useState(admin.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const phoneOk = isValidPhone(phone)
  const changed = phone !== admin.phone || name.trim() !== (admin.name ?? '')

  const mut = useMutation({
    mutationFn: () => platformApi.updateAdmin(admin.id, { name: name.trim() || null, phone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'admins'] })
      toast.success('Yönetici güncellendi')
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!phoneOk || !changed || mut.isPending) return
    setError(null)
    mut.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Yöneticiyi düzenle"
      description={admin.is_me ? 'Kendi bilgilerinizi düzenliyorsunuz.' : 'Telefon değişirse bu yöneticinin açık oturumları kapanır.'}
      dismissible={!mut.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="edit-admin-form" loading={mut.isPending} disabled={!phoneOk || !changed}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="edit-admin-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Ad" hint="İsteğe bağlı">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="off" data-autofocus />
        </Field>
        <Field label="Cep telefonu (giriş adı)" required hint="5XXXXXXXXX" error={phone.length === 10 && !phoneOk ? 'Geçerli bir cep telefonu girin' : undefined}>
          <PhoneInput value={phone} onValueChange={setPhone} autoComplete="off" />
        </Field>
        <ServerError message={error} />
      </form>
    </Modal>
  )
}

/* ------------------------------ Şifre sıfırla ------------------------------ */

export function ResetPasswordModal({ admin, onClose }: { admin: PlatformAdmin | null; onClose: () => void }) {
  return admin ? <ResetPasswordBody key={admin.id} admin={admin} onClose={onClose} /> : null
}

function ResetPasswordBody({ admin, onClose }: { admin: PlatformAdmin; onClose: () => void }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const valid = checkPassword(password, admin.phone).valid && password === confirm

  const mut = useMutation({
    mutationFn: () => platformApi.resetAdminPassword(admin.id, password),
    onSuccess: () => {
      toast.success(admin.is_me ? 'Şifre sıfırlandı. Oturumunuz kapandı, yeniden giriş yapın.' : 'Şifre sıfırlandı. Yöneticinin açık oturumları kapandı.')
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || mut.isPending) return
    setError(null)
    mut.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Şifre sıfırla"
      description={`${admin.name || admin.phone} için yeni bir şifre belirleyin. Yöneticinin açık oturumları kapanır.`}
      dismissible={!mut.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" form="reset-password-form" loading={mut.isPending} disabled={!valid}>
            Şifreyi sıfırla
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={submit} className="flex flex-col gap-4">
        <NewPasswordFields value={password} confirm={confirm} onValue={setPassword} onConfirm={setConfirm} phone={admin.phone} />
        <ServerError message={error} />
      </form>
    </Modal>
  )
}
