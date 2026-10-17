// Görselleri tarayıcıda küçültüp data URL'e çevirir; telefon fotoğrafları birkaç MB olur,
// backend ise görsel başına ~1,5 MB kabul eder.

export type ImageType = 'image/png' | 'image/jpeg'

/** Backend'in görseller için kabul ettiği en uzun data URL (karakter, ~1,5 MB). */
export const MAX_IMAGE_CHARS = 2_000_000

/** Hizmet görseli müşteri sitesinde tüm liste birlikte indirildiği için küçük tutulur (~250 KB; backend sınırı 400 bin karakter). */
export const SERVICE_IMAGE_MAX_CHARS = 380_000

/** Personel fotoğrafı da aynı sınırı kullanır; 1400px JPEG genelde 300-600 KB tutar. */
export const STAFF_PHOTO_MAX_CHARS = MAX_IMAGE_CHARS

// Sınırı aşarsa önce kaliteyi, sonra boyutu düşürerek yeniden dener.
const JPEG_QUALITIES = [0.9, 0.84, 0.76]
const SHRINK_STEPS = [1, 0.8, 0.64]

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Görsel okunamadı. Farklı bir dosya deneyin.'))
    el.src = url
  })
}

function render(img: HTMLImageElement, maxDim: number, type: ImageType, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Görsel işlenemedi.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff' // JPEG'de şeffaflık yok: şeffaf pikseller beyaz olur (her iki temada nötr)
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL(type, quality)
}

export async function fileToDataUrl(file: File, maxDim: number, type: ImageType, maxChars = MAX_IMAGE_CHARS): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const qualities = type === 'image/jpeg' ? JPEG_QUALITIES : [1]
    for (const shrink of SHRINK_STEPS) {
      for (const quality of qualities) {
        const out = render(img, Math.round(maxDim * shrink), type, quality)
        if (out.length <= maxChars) return out
      }
    }
    throw new Error('Görsel çok büyük. Daha küçük bir dosya seçin.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
