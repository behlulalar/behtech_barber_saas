import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { formatPhone, fullName, isValidPhone, normalizePhone } from '../../lib/format'
import { ROLE_LABELS } from '../../layouts/AdminLayout'
import type { AdminStaff, AdminStaffUpdate, StaffRole } from '../../types/api'
import { ErrorBlock, qk, telHref, useStaffList } from './shared'

const ROLE_TONES: Record<StaffRole, BadgeTone> = { super_admin: 'copper', technical_support: 'info', staff: 'neutral' }

export default function StaffPage() {
  const { me, isManager, isOwner } = useStaffAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const query = useStaffList()
  const [editing, setEditing] = useState<AdminStaff | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminStaff | null>(null)

  const remove = useMutation({
    mutationFn: (s: AdminStaff) => adminApi.deleteStaff(s.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.staff })
      toast.success('Ekip üyesi silindi')
      setDeleting(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDeleting(null)
    },
  })

  // Sahip hesabına yalnızca sahip dokunabilir (backend de zorlar).
  const canEdit = (s: AdminStaff) => isManager && (isOwner || s.role !== 'super_admin')
  const canDelete = (s: AdminStaff) => canEdit(s) && s.id !== me?.id

  const rows = query.data ?? []

  const columns: Column<AdminStaff>[] = [
    {
      key: 'name',
      header: 'Ad Soyad',
      primary: true,
      cell: (s) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={fullName(s)} size="sm" className="hidden md:inline-flex" />
          <span className="min-w-0 truncate font-medium">{fullName(s)}</span>
          {s.id === me?.id && <Badge tone="neutral">Siz</Badge>}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Telefon',
      cell: (s) => (
        <a href={telHref(s.phone)} className="inline-flex min-h-11 items-center gap-2 text-copper-bright hover:underline md:min-h-0">
          <Phone className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums">{formatPhone(s.phone)}</span>
        </a>
      ),
    },
    { key: 'role', header: 'Rol', cell: (s) => <Badge tone={ROLE_TONES[s.role]}>{ROLE_LABELS[s.role]}</Badge> },
  ]
  if (isManager) {
    const actions = (s: AdminStaff) => (
      <div className="flex justify-end gap-1">
        {canEdit(s) && (
          <IconButton label={`${fullName(s)} düzenle`} onClick={() => setEditing(s)}>
            <Pencil className="size-[18px]" />
          </IconButton>
        )}
        {canDelete(s) && (
          <IconButton label={`${fullName(s)} sil`} onClick={() => setDeleting(s)} className="hover:text-danger">
            <Trash2 className="size-[18px]" />
          </IconButton>
        )}
      </div>
    )
    columns.push({ key: 'actions', header: '', align: 'right', hideOnMobile: true, className: 'w-28', cell: actions })
  }

  return (
    <>
      <PageHeader
        title="Ekip"
        description={isManager ? 'Berberler ve yöneticiler. Her biri kendi telefon numarası ve şifresiyle giriş yapar.' : 'Dükkândaki ekip arkadaşlarınız.'}
        actions={
          isManager && (
            <Button onClick={() => setEditing('new')} leftIcon={<Plus className="size-4" />}>
              Yeni üye
            </Button>
          )
        }
      />

      {query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Table
          caption="Ekip listesi"
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          loading={query.isLoading}
          mobileActions={
            isManager
              ? (s) => (
                  <div className="-mr-2 -mt-2 flex">
                    {canEdit(s) && (
                      <IconButton label={`${fullName(s)} düzenle`} onClick={() => setEditing(s)}>
                        <Pencil className="size-[18px]" />
                      </IconButton>
                    )}
                    {canDelete(s) && (
                      <IconButton label={`${fullName(s)} sil`} onClick={() => setDeleting(s)} className="hover:text-danger">
                        <Trash2 className="size-[18px]" />
                      </IconButton>
                    )}
                  </div>
                )
              : undefined
          }
          empty={<EmptyState icon={<UserRound />} title="Ekip boş" description="İlk ekip üyesini ekleyin." />}
        />
      )}

      {editing && <StaffForm key={editing === 'new' ? 'new' : editing.id} member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        destructive
        title="Ekip üyesi silinsin mi?"
        description={
          <>
            <strong className="text-cream">{deleting ? fullName(deleting) : ''}</strong> hesabı kalıcı olarak silinecek ve giriş yapamayacak. Randevusu olan üyeler silinemez.
          </>
        }
        confirmLabel="Sil"
      />
    </>
  )
}

function StaffForm({ member, onClose }: { member: AdminStaff | null; onClose: () => void }) {
  const { me, isOwner } = useStaffAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const isSelf = member?.id === me?.id
  const [name, setName] = useState(member?.name ?? '')
  const [surname, setSurname] = useState(member?.surname ?? '')
  const [phone, setPhone] = useState(member ? formatPhone(member.phone) : '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<StaffRole>(member?.role ?? 'staff')
  const [touched, setTouched] = useState(false)

  const creating = !member
  const errors = {
    name: touched && !name.trim() ? 'Ad gerekli.' : null,
    surname: touched && !surname.trim() ? 'Soyad gerekli.' : null,
    phone: touched && !isValidPhone(phone) ? 'Geçerli bir telefon girin (5XX XXX XX XX).' : null,
    password:
      touched && ((creating && password.length < 6) || (!creating && password !== '' && password.length < 6)) ? 'Şifre en az 6 karakter olmalı.' : null,
  }

  const save = useMutation({
    mutationFn: () => {
      if (!member) {
        return adminApi.createStaff({ name: name.trim(), surname: surname.trim(), phone: normalizePhone(phone), password, role })
      }
      const data: AdminStaffUpdate = {}
      if (name.trim() !== member.name) data.name = name.trim()
      if (surname.trim() !== member.surname) data.surname = surname.trim()
      if (normalizePhone(phone) !== member.phone) data.phone = normalizePhone(phone)
      if (role !== member.role) data.role = role
      if (password) data.password = password
      return adminApi.updateStaff(member.id, data)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.staff })
      toast.success(member ? 'Ekip üyesi güncellendi' : 'Ekip üyesi eklendi')
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function submit() {
    setTouched(true)
    if (!name.trim() || !surname.trim() || !isValidPhone(phone)) return
    if ((creating && password.length < 6) || (password !== '' && password.length < 6)) return
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!save.isPending}
      size="sm"
      title={member ? 'Ekip üyesini düzenle' : 'Yeni ekip üyesi'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {member ? 'Kaydet' : 'Ekle'}
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
          <Field label="Ad" required error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-autofocus />
          </Field>
          <Field label="Soyad" required error={errors.surname}>
            <Input value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label="Telefon" required error={errors.phone} hint="Giriş için kullanılır.">
          <Input type="tel" inputMode="tel" placeholder="5XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </Field>
        <Field
          label={creating ? 'Şifre' : 'Yeni şifre'}
          required={creating}
          error={errors.password}
          hint={creating ? 'En az 6 karakter. Üyeye siz iletirsiniz.' : 'Değiştirmek istemiyorsanız boş bırakın.'}
        >
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Rol" hint={isSelf ? 'Kendi rolünüzü değiştiremezsiniz.' : 'Yöneticiler hizmet, ekip ve ayarları düzenleyebilir.'}>
          <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} disabled={isSelf}>
            <option value="staff">{ROLE_LABELS.staff}</option>
            <option value="technical_support">{ROLE_LABELS.technical_support}</option>
            {(isOwner || role === 'super_admin') && <option value="super_admin">{ROLE_LABELS.super_admin}</option>}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}
