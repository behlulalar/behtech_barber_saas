import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field } from '../../components/ui/Field'
import { ImagePicker } from '../../components/ui/ImagePicker'
import { Input } from '../../components/ui/Input'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Switch } from '../../components/ui/Switch'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import type { TenantSettings } from '../../types/api'
import { ErrorBlock, qk } from './shared'

export default function SettingsPage() {
  const query = useQuery({ queryKey: qk.settings, queryFn: adminApi.getSettings })
  return (
    <>
      <PageHeader title="Ayarlar" description="İşletme bilgileriniz müşteri sitesinde görünür." />
      {query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading || !query.data ? (
        <div className="grid max-w-3xl gap-6" role="status" aria-label="Yükleniyor">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <SettingsForm initial={query.data} />
      )}
    </>
  )
}

function SettingsForm({ initial }: { initial: TenantSettings }) {
  const { isManager } = useStaffAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState<TenantSettings>({ ...initial, business_address: initial.business_address ?? '' })
  const [touched, setTouched] = useState(false)

  const dirty =
    form.business_name !== initial.business_name ||
    (form.business_address ?? '') !== (initial.business_address ?? '') ||
    form.logo_image !== initial.logo_image ||
    form.banner_image !== initial.banner_image ||
    form.notification_banner_enabled !== initial.notification_banner_enabled ||
    (form.contact_phone ?? '') !== (initial.contact_phone ?? '') ||
    (form.whatsapp_phone ?? '') !== (initial.whatsapp_phone ?? '') ||
    (form.instagram ?? '') !== (initial.instagram ?? '')

  const save = useMutation({
    mutationFn: () => adminApi.updateSettings({ ...form, business_name: form.business_name.trim(), business_address: form.business_address?.trim() || null }),
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data)
      // Sunucu değerleri normalize eder (ör. Instagram bağlantısı → kullanıcı adı); formu temiz haliyle yenile.
      setForm({ ...data, business_address: data.business_address ?? '' })
      void qc.invalidateQueries({ queryKey: ['public', 'tenant'] })
      toast.success('Ayarlar kaydedildi')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const set = <K extends keyof TenantSettings>(k: K, v: TenantSettings[K]) => setForm((f) => ({ ...f, [k]: v }))

  function submit() {
    setTouched(true)
    if (!form.business_name.trim()) return
    save.mutate()
  }

  return (
    <form
      className="grid max-w-3xl gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {!isManager && (
        <p className="rounded-md border border-panel-line bg-panel px-4 py-3 text-sm text-muted-strong">Ayarları yalnızca yöneticiler değiştirebilir.</p>
      )}

      <Card>
        <CardHeader title="İşletme" description="Randevu sayfasında ve bildirimlerde bu bilgiler kullanılır." />
        <fieldset disabled={!isManager} className="flex min-w-0 flex-col gap-4">
          <Field label="İşletme adı" required error={touched && !form.business_name.trim() ? 'İşletme adı gerekli.' : null}>
            <Input value={form.business_name} maxLength={255} onChange={(e) => set('business_name', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Adres" hint="Müşterilerin sizi bulabilmesi için açık adres.">
            <Textarea rows={3} maxLength={1000} value={form.business_address ?? ''} onChange={(e) => set('business_address', e.target.value)} />
          </Field>
        </fieldset>
      </Card>

      <Card>
        <CardHeader title="İletişim" description="Müşteri sitenizde ikonlarla gösterilir. Boş bıraktığınız alan gösterilmez." />
        <fieldset disabled={!isManager} className="grid min-w-0 gap-4 md:grid-cols-2">
          <Field label="Telefon" hint="Cep ya da sabit hat. Müşteriler dokunarak arar.">
            <PhoneInput value={form.contact_phone ?? ''} onValueChange={(v) => set('contact_phone', v || null)} autoComplete="off" />
          </Field>
          <Field label="WhatsApp numarası" hint="Müşteriler WhatsApp'tan yazabilir.">
            <PhoneInput value={form.whatsapp_phone ?? ''} onValueChange={(v) => set('whatsapp_phone', v || null)} autoComplete="off" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Instagram" hint="Kullanıcı adınızı ya da profil bağlantınızı yazın (örn. berberali).">
              <Input
                value={form.instagram ?? ''}
                maxLength={120}
                leading={<span aria-hidden="true">@</span>}
                onChange={(e) => set('instagram', e.target.value || null)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          </div>
        </fieldset>
      </Card>

      <Card>
        <CardHeader title="Görseller" description="Logo ve kapak fotoğrafı. Büyük dosyalar otomatik küçültülür." />
        <fieldset disabled={!isManager} className="grid min-w-0 gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
          <ImagePicker label="Logo" value={form.logo_image} onChange={(v) => set('logo_image', v)} aspect="square" maxDim={512} type="image/png" />
          <ImagePicker label="Kapak fotoğrafı" value={form.banner_image} onChange={(v) => set('banner_image', v)} aspect="wide" maxDim={1600} type="image/jpeg" />
        </fieldset>
      </Card>

      <Card>
        <CardHeader title="Duyuru bandı" />
        <Switch
          disabled={!isManager}
          checked={form.notification_banner_enabled}
          onChange={(v) => set('notification_banner_enabled', v)}
          label="Duyuru bandını göster"
          description="Açıkken müşteri sitesinde duyuru bandı gösterilir."
        />
      </Card>

      {isManager && (
        <div>
          <div className="flex items-center gap-3 md:justify-start">
            <Button type="submit" loading={save.isPending} disabled={!dirty} className="flex-1 md:flex-none">
              {dirty ? 'Değişiklikleri kaydet' : 'Kaydedildi'}
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setForm({ ...initial, business_address: initial.business_address ?? '' })} disabled={save.isPending}>
                Geri al
              </Button>
            )}
          </div>
        </div>
      )}
    </form>
  )
}
