import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleSlash, KeyRound, LogOut, Pencil, Power, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button, IconButton } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Table, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { errorMessage, platformApi } from '../../lib/api'
import { usePlatformAuth } from '../../lib/auth'
import { formatPhone } from '../../lib/format'
import type { PlatformAdmin } from '../../types/api'
import { AddAdminModal, ChangePasswordModal, EditAdminModal, ResetPasswordModal } from './AdminModals'
import { formatDateTimeDMY, ServerError } from './platformShared'

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="success">
      <CircleCheck className="size-3.5" aria-hidden="true" />
      Aktif
    </Badge>
  ) : (
    <Badge tone="neutral">
      <CircleSlash className="size-3.5" aria-hidden="true" />
      Pasif
    </Badge>
  )
}

function MyAccount({ onChangePassword, onLogoutAll }: { onChangePassword: () => void; onLogoutAll: () => void }) {
  const { me } = usePlatformAuth()
  return (
    <Card>
      <CardHeader
        title="Hesabım"
        description="Kendi oturumunuz ve şifreniz."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" leftIcon={<KeyRound className="size-4" />} onClick={onChangePassword}>
              Şifreyi değiştir
            </Button>
            <Button variant="ghost" leftIcon={<LogOut className="size-4" />} onClick={onLogoutAll}>
              Tüm cihazlardan çıkış
            </Button>
          </div>
        }
      />
      {me ? (
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-[0.1em] text-muted">Ad</dt>
            <dd className="mt-1 break-words text-cream">{me.name || 'Belirtilmemiş'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-[0.1em] text-muted">Telefon</dt>
            <dd className="mt-1 text-cream">{formatPhone(me.phone)}</dd>
          </div>
        </dl>
      ) : (
        <Skeleton className="h-12 w-full" />
      )}
    </Card>
  )
}

export default function AdminsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { logout, me } = usePlatformAuth()
  const admins = useQuery({ queryKey: ['platform', 'admins'], queryFn: platformApi.listAdmins })

  const [changingPw, setChangingPw] = useState(false)
  const [loggingOutAll, setLoggingOutAll] = useState(false)
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<PlatformAdmin | null>(null)
  const [editing, setEditing] = useState<PlatformAdmin | null>(null)
  const [toggling, setToggling] = useState<PlatformAdmin | null>(null)
  const [deleting, setDeleting] = useState<PlatformAdmin | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const logoutAll = useMutation({
    mutationFn: platformApi.logoutAll,
    onSuccess: () => logout(),
    onError: (err) => {
      setLoggingOutAll(false)
      toast.error(errorMessage(err))
    },
  })

  const toggle = useMutation({
    mutationFn: (a: PlatformAdmin) => platformApi.updateAdmin(a.id, { is_active: !a.is_active }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['platform', 'admins'] })
      toast.success(a.is_active ? 'Yönetici aktifleştirildi' : 'Yönetici pasife alındı')
      setToggling(null)
    },
    onError: (err) => {
      setToggling(null)
      setActionError(errorMessage(err))
    },
  })

  const remove = useMutation({
    mutationFn: (a: PlatformAdmin) => platformApi.deleteAdmin(a.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'admins'] })
      toast.success('Yönetici silindi')
      setDeleting(null)
    },
    onError: (err) => {
      setDeleting(null)
      setActionError(errorMessage(err))
    },
  })

  function onToggle(a: PlatformAdmin) {
    setActionError(null)
    if (a.is_active) setToggling(a)
    else toggle.mutate(a)
  }
  function onDelete(a: PlatformAdmin) {
    setActionError(null)
    setDeleting(a)
  }

  function actions(a: PlatformAdmin) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" leftIcon={<Pencil className="size-4" />} onClick={() => setEditing(a)}>
          Düzenle
        </Button>
        <Button size="sm" variant="ghost" leftIcon={<Power className="size-4" />} onClick={() => onToggle(a)} disabled={toggle.isPending}>
          {a.is_active ? 'Pasife al' : 'Aktifleştir'}
        </Button>
        <Button size="sm" variant="ghost" leftIcon={<KeyRound className="size-4" />} onClick={() => setResetting(a)}>
          Şifre sıfırla
        </Button>
        <Button size="sm" variant="ghost" className="text-danger hover:text-danger" leftIcon={<Trash2 className="size-4" />} onClick={() => onDelete(a)}>
          Sil
        </Button>
      </div>
    )
  }

  function mobileActions(a: PlatformAdmin) {
    return (
      <div className="-mr-2 -mt-2 flex shrink-0">
        <IconButton label="Düzenle" onClick={() => setEditing(a)}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton label={a.is_active ? 'Pasife al' : 'Aktifleştir'} onClick={() => onToggle(a)} disabled={toggle.isPending}>
          <Power className="size-4" />
        </IconButton>
        <IconButton label="Şifre sıfırla" onClick={() => setResetting(a)}>
          <KeyRound className="size-4" />
        </IconButton>
        <IconButton label="Sil" className="text-danger" onClick={() => onDelete(a)}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    )
  }

  const columns: Column<PlatformAdmin>[] = [
    {
      key: 'who',
      header: 'Yönetici',
      primary: true,
      cell: (a) => (
        <div className="flex flex-wrap items-center gap-2">
          <span>{a.name || formatPhone(a.phone)}</span>
          {a.is_me && <Badge tone="copper">Siz</Badge>}
        </div>
      ),
    },
    { key: 'phone', header: 'Telefon', cell: (a) => formatPhone(a.phone) },
    { key: 'status', header: 'Durum', cell: (a) => <ActiveBadge active={a.is_active} /> },
    {
      key: 'last',
      header: 'Son giriş',
      cell: (a) => formatDateTimeDMY(a.last_login_at) || <span className="text-muted">Hiç girmedi</span>,
    },
    { key: 'actions', header: '', align: 'right', hideOnMobile: true, cell: actions },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Yöneticiler"
        description="Platform paneline erişebilen kişiler. Her işlem denetim kaydına yazılır."
        actions={
          <Button leftIcon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
            Yönetici ekle
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <MyAccount onChangePassword={() => setChangingPw(true)} onLogoutAll={() => setLoggingOutAll(true)} />

        <Card>
          <CardHeader title="Tüm yöneticiler" description="Kendinizi ya da son aktif yöneticiyi pasife alamaz veya silemezsiniz." />
          {actionError && (
            <div className="mb-4">
              <ServerError message={actionError} />
            </div>
          )}
          {admins.isError ? (
            <ServerError message={errorMessage(admins.error)} />
          ) : (
            <Table
              columns={columns}
              rows={admins.data ?? []}
              rowKey={(a) => a.id}
              mobileActions={mobileActions}
              loading={admins.isLoading}
              caption="Platform yöneticileri"
              empty={<EmptyState title="Yönetici yok" description="Yönetici ekleyerek başlayın." />}
            />
          )}
        </Card>
      </div>

      <ChangePasswordModal open={changingPw} onClose={() => setChangingPw(false)} phone={me?.phone ?? ''} />
      <AddAdminModal open={adding} onClose={() => setAdding(false)} />
      <EditAdminModal admin={editing} onClose={() => setEditing(null)} />
      <ResetPasswordModal admin={resetting} onClose={() => setResetting(null)} />

      <ConfirmDialog
        open={loggingOutAll}
        onClose={() => setLoggingOutAll(false)}
        onConfirm={() => logoutAll.mutate()}
        loading={logoutAll.isPending}
        destructive
        title="Tüm cihazlardan çıkış yapılsın mı?"
        description="Bu cihaz dahil tüm açık oturumlarınız kapanır; yeniden giriş yapmanız gerekir."
        confirmLabel="Çıkış yap"
      />
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        loading={toggle.isPending}
        destructive
        title="Yönetici pasife alınsın mı?"
        description={`${toggling?.name || (toggling ? formatPhone(toggling.phone) : '')} artık giriş yapamaz ve açık oturumları kapanır. Dilediğiniz zaman yeniden aktifleştirebilirsiniz.`}
        confirmLabel="Pasife al"
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        destructive
        title="Yönetici silinsin mi?"
        description={`${deleting?.name || (deleting ? formatPhone(deleting.phone) : '')} kalıcı olarak silinir. Bu işlem geri alınamaz; geçmiş denetim kayıtları korunur.`}
        confirmLabel="Sil"
      />
    </>
  )
}
