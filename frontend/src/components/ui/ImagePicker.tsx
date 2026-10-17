import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { fileToDataUrl, type ImageType } from '../../lib/image'
import { Button } from './Button'
import { useToast } from './Toast'

interface ImagePickerProps {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  /** square: logo (contain), wide: kapak, portrait: personel fotoğrafı (yuvarlak, cover). */
  aspect: 'square' | 'wide' | 'portrait' | 'card'
  maxDim: number
  type: ImageType
  maxChars?: number
  disabled?: boolean
}

export function ImagePicker({ label, value, onChange, aspect, maxDim, type, maxChars, disabled }: ImagePickerProps) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      onChange(await fileToDataUrl(file, maxDim, type, maxChars))
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
          aspect === 'square' && 'aspect-square max-w-48',
          aspect === 'wide' && 'aspect-[16/7]',
          aspect === 'card' && 'aspect-[4/3] max-w-xs',
          aspect === 'portrait' && 'aspect-square max-w-28 rounded-full',
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
        <Button variant="secondary" size="sm" loading={busy} disabled={disabled} onClick={() => inputRef.current?.click()} leftIcon={<ImagePlus className="size-4" />}>
          {value ? 'Değiştir' : 'Görsel seç'}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)} leftIcon={<Trash2 className="size-4" />}>
            Kaldır
          </Button>
        )}
      </div>
    </div>
  )
}
