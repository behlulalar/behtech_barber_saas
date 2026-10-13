import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field } from '../../components/ui/Field'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Switch } from '../../components/ui/Switch'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { adminApi, errorMessage } from '../../lib/api'
import { useStaffAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import type { TenantSettings } from '../../types/api'
import { ErrorBlock, qk } from './shared'

const MAX_DATA_URL = 6_500_000 // backend sınırı 7M karakter

/** Görseli tarayıcıda küçültüp data URL'e çevirir (telefon fotoğrafları çok büyük olur). */
async function fileToDataUrl(file: File, maxDim: number, type: 'image/png' | 'image/jpeg'): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Görsel okunamadı. Farklı bir dosya deneyin.'))
      el.src = url
    })
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Görsel işlenemedi.')
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#15110e'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(img, 0, 0, w, h)
    const out = canvas.toDataURL(type, 0.82)
    if (out.length > MAX_DATA_URL) throw new Error('Görsel çok büyük. Daha küçük bir dosya seçin.')
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
    form.notification_banner_enabled !== initial.notification_banner_enabled

  const save = useMutation({
    mutationFn: () => adminApi.updateSettings({ ...form, business_name: form.business_name.trim(), business_address: form.business_address?.trim() || null }),
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data)
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

interface PickerProps {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  aspect: 'square' | 'wide'
  maxDim: number
  type: 'image/png' | 'image/jpeg'
}

function ImagePicker({ label, value, onChange, aspect, maxDim, type }: PickerProps) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      onChange(await fileToDataUrl(file, maxDim, type))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Görsel yüklenemedi.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[13px] font-medium tracking-wide text-muted-strong">{label}</p>
      <div
        className={cn(
          'flex w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-line-strong bg-surface',
          aspect === 'square' ? 'aspect-square max-w-48' : 'aspect-[16/7]',
        )}
      >
        {value ? (
          <img src={value} alt={`${label} önizleme`} className={cn('size-full', aspect === 'square' ? 'object-contain p-2' : 'object-cover')} />
        ) : (
          <ImagePlus className="size-7 text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label={`${label} dosyası seç`}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()} leftIcon={<ImagePlus className="size-4" />}>
          {value ? 'Değiştir' : 'Görsel seç'}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} leftIcon={<Trash2 className="size-4" />}>
            Kaldır
          </Button>
        )}
      </div>
    </div>
  )
}
