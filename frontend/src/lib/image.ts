// Görselleri tarayıcıda küçültüp data URL'e çevirir; telefon fotoğrafları birkaç MB olur,
// backend ise görsel başına ~1,5 MB (personel fotoğrafı için 300 KB) kabul eder.

export type ImageType = 'image/png' | 'image/jpeg'

/** Backend'in ayarlar görselleri için kabul ettiği en uzun data URL (karakter). */
export const MAX_IMAGE_CHARS = 2_000_000

/** Personel fotoğrafı için sınır (backend 400K karakter). 480px JPEG bunun çok altında kalır. */
export const STAFF_PHOTO_MAX_CHARS = 380_000

export async function fileToDataUrl(file: File, maxDim: number, type: ImageType, maxChars = MAX_IMAGE_CHARS): Promise<string> {
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
    if (out.length > maxChars) throw new Error('Görsel çok büyük. Daha küçük bir dosya seçin.')
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}

