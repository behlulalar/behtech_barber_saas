import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Phone, Plus, Trash2, UserMinus, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Checkbox'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { ImagePicker } from '../../components/ui/ImagePicker'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { STAFF_PHOTO_MAX_CHARS } from '../../lib/image'
import { formatPhone, fullName, isValidPhone, normalizePhone } from '../../lib/format'
import { ROLE_LABELS } from '../../layouts/AdminLayout'
import type { AdminStaff, AdminStaffUpdate, StaffRole } from '../../types/api'
import { ErrorBlock, qk, telHref, useServiceList, useStaffList } from './shared'

const ROLE_TONES: Record<StaffRole, BadgeTone> = { super_admin: 'copper', technical_support: 'info', staff: 'neutral' }

export default function StaffPage() {
  const { me, isManager, isOwner } = useStaffAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const query = useStaffList()
  const [editing, setEditing] = useState<AdminStaff | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminStaff | null>(null)
  const [leaving, setLeaving] = useState<AdminStaff | null>(null)

  const setActive = useMutation({
    mutationFn: ({ s, active }: { s: AdminStaff; active: boolean }) => adminApi.updateStaff(s.id, { is_active: active }),
    onSuccess: (_d, { active }) => {
      void qc.invalidateQueries({ queryKey: qk.staff })
      toast.success(active ? 'Ekip üyesi tekrar aktifleştirildi' : 'Ekip üyesi işten ayrıldı olarak işaretlendi')
      setLeaving(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setLeaving(null)
    },
  })

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

  const rows = (query.data ?? []).filter((s) => s.is_active)
  const former = (query.data ?? []).filter((s) => !s.is_active)

  const columns: Column<AdminStaff>[] = [
    {
      key: 'name',
      header: 'Ad Soyad',
      primary: true,
      cell: (s) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={fullName(s)} src={s.photo_image} size="sm" className={s.photo_image ? undefined : 'hidden md:inline-flex'} />
          <span className="min-w-0 truncate font-medium">{fullName(s)}</span>
          {s.id === me?.id && <Badge tone="neutral">Siz</Badge>}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Telefon',
      cell: (s) =>
        // Personel meslektaşlarının telefonunu göremez (backend boş döner).
        s.phone ? (
          <a href={telHref(s.phone)} className="inline-flex min-h-11 items-center gap-2 text-copper-bright hover:underline md:pointer-fine:min-h-0">
            <Phone className="size-3.5" aria-hidden="true" />
            <span className="tabular-nums">{formatPhone(s.phone)}</span>
          </a>
        ) : (
          <span className="text-muted">—</span>
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
          <IconButton label={`${fullName(s)} işten ayrıldı`} onClick={() => setLeaving(s)}>
            <UserMinus className="size-[18px]" />
          </IconButton>
        )}
        {canDelete(s) && (
          <IconButton label={`${fullName(s)} sil`} onClick={() => setDeleting(s)} className="hover:text-danger">
            <Trash2 className="size-[18px]" />
          </IconButton>
        )}
      </div>
    )
    columns.push({ key: 'actions', header: '', align: 'right', hideOnMobile: true, className: 'w-36', cell: actions })
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
                      <IconButton label={`${fullName(s)} işten ayrıldı`} onClick={() => setLeaving(s)}>
                        <UserMinus className="size-[18px]" />
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

      {isManager && former.length > 0 && (
        <section aria-labelledby="former-staff" className="mt-8">
          <h2 id="former-staff" className="text-base font-semibold text-muted-strong">
            Eski personel
          </h2>
          <p className="mb-3 mt-1 text-sm text-muted">Giriş yapamaz, müşteri sitesinde görünmez; geçmiş randevu ve gelir kayıtları korunur.</p>
          <ul className="flex flex-col divide-y divide-panel-line rounded-md border border-panel-line">
            {former.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <span className="flex min-w-0 items-center gap-3 text-muted">
                  <Avatar name={fullName(s)} src={s.photo_image} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{fullName(s)}</span>
                    <span className="block text-xs">{s.left_at ? `Ayrılış: ${new Date(s.left_at + 'T00:00:00').toLocaleDateString('tr-TR')}` : 'İşten ayrıldı'}</span>
                  </span>
                </span>
                {canEdit(s) && (
                  <Button variant="ghost" size="sm" onClick={() => setActive.mutate({ s, active: true })} loading={setActive.isPending && setActive.variables?.s.id === s.id}>
                    Tekrar aktifleştir
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && <StaffForm key={editing === 'new' ? 'new' : editing.id} member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(leaving)}
        onClose={() => setLeaving(null)}
        onConfirm={() => leaving && setActive.mutate({ s: leaving, active: false })}
        loading={setActive.isPending}
        destructive
        title="İşten ayrıldı olarak işaretlensin mi?"
        description={
          <>
            <strong className="text-cream">{leaving ? fullName(leaving) : ''}</strong> için giriş kapanır ve müşteri sitesinde görünmez. Geçmiş randevu ve gelir kayıtları korunur. Gelecek randevusu varsa önce onları iptal etmeniz gerekir. İsterseniz sonra tekrar aktifleştirebilirsiniz.
          </>
        }
        confirmLabel="İşten ayrıldı"
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        destructive
        title="Ekip üyesi silinsin mi?"
        description={
          <>
            <strong className="text-cream">{deleting ? fullName(deleting) : ''}</strong> hesabı kalıcı olarak silinecek ve giriş yapamayacak. Randevusu olan üyeler silinemez; çalışmayı bıraktıysa “İşten ayrıldı” kullanın.
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
  const [photo, setPhoto] = useState<string | null>(member?.photo_image ?? null)
  const servicesQuery = useServiceList()
  const services = servicesQuery.data ?? []
  // null: henüz dokunulmadı (yeni üyede varsayılan = tüm hizmetler).
  const [picked, setPicked] = useState<number[] | null>(member ? member.service_ids : null)
  const selected = picked ?? services.map((x) => x.id)
  const serviceIds = new Set(services.map((x) => x.id))
  const offersServices = role !== 'technical_support'
  const toggleService = (id: number, on: boolean) => setPicked(on ? [...selected, id] : selected.filter((x) => x !== id))

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
        return adminApi.createStaff({
          name: name.trim(),
          surname: surname.trim(),
          phone: normalizePhone(phone),
          password,
          role,
          ...(photo ? { photo_image: photo } : {}),
          ...(offersServices ? { service_ids: selected.filter((id) => serviceIds.has(id)) } : {}),
        })
      }
      const data: AdminStaffUpdate = {}
      if (name.trim() !== member.name) data.name = name.trim()
      if (surname.trim() !== member.surname) data.surname = surname.trim()
      if (normalizePhone(phone) !== member.phone) data.phone = normalizePhone(phone)
      if (role !== member.role) data.role = role
      if (password) data.password = password
      if (photo !== member.photo_image) data.photo_image = photo
      if (offersServices) {
        const next = selected.filter((id) => serviceIds.has(id))
        const prev = member.service_ids
        if (next.length !== prev.length || next.some((id) => !prev.includes(id))) data.service_ids = next
      }
      return adminApi.updateStaff(member.id, data)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.staff })
      void qc.invalidateQueries({ queryKey: qk.services })
      toast.success(member ? 'Ekip üyesi güncellendi' : 'Ekip üyesi eklendi')
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function submit() {
    setTouched(true)
    if (offersServices && !servicesQuery.data) return
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
        <ImagePicker
          label="Fotoğraf"
          value={photo}
          onChange={setPhoto}
          aspect="portrait"
          maxDim={1400}
          type="image/jpeg"
          maxChars={STAFF_PHOTO_MAX_CHARS}
          disabled={save.isPending}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ad" required error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-autofocus />
          </Field>
          <Field label="Soyad" required error={errors.surname}>
            <Input value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label="Telefon" required error={errors.phone} hint="Giriş için kullanılır.">
          <PhoneInput value={phone} onValueChange={setPhone} autoComplete="off" />
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
        {offersServices && (
          <fieldset className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3">
              <legend className="text-[13px] font-medium tracking-wide text-muted-strong">Verdiği hizmetler</legend>
              {services.length > 0 && (
                <span className="flex">
                  <button type="button" onClick={() => setPicked(services.map((x) => x.id))} className="min-h-11 px-2 text-sm text-copper-bright hover:underline">
                    Tümünü seç
                  </button>
                  <button type="button" onClick={() => setPicked([])} className="min-h-11 px-2 text-sm text-copper-bright hover:underline">
                    Hiçbirini
                  </button>
                </span>
              )}
            </div>
            {servicesQuery.isLoading ? (
              <p className="text-sm text-muted">Hizmetler yükleniyor…</p>
            ) : servicesQuery.isError ? (
              <p className="text-sm text-danger">{errorMessage(servicesQuery.error, 'Hizmetler yüklenemedi.')}</p>
            ) : services.length === 0 ? (
              <p className="text-sm text-muted">Henüz hizmet yok.</p>
            ) : (
              <div className="divide-y divide-line rounded-md border border-line px-3">
                {services.map((x) => (
                  <Checkbox
                    key={x.id}
                    checked={selected.includes(x.id)}
                    onChange={(e) => toggleService(x.id, e.target.checked)}
                    label={
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate">{x.name}</span>
                        {!x.is_active && <Badge tone="neutral">pasif</Badge>}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
            {!servicesQuery.isLoading && services.length > 0 && selected.filter((id) => serviceIds.has(id)).length === 0 && (
              <p role="status" className="mt-2 text-sm text-warning">
                Hiç hizmet seçilmedi; müşteriler bu kişiden randevu alamaz.
              </p>
            )}
          </fieldset>
        )}
      </form>
    </Modal>
  )
}
