import { cn } from '../../lib/cn'

/** Hizmet görseli. Fotoğraf varsa onu, yoksa hizmete özgü bir yedek tasarımı gösterir: hizmetin baş harfi (her kart farklı
 * görünsün) + id'ye göre açısı değişen çok hafif çizgili zemin. Boyut ve yuvarlaklık çağıran tarafından verilir (className). */
export function ServiceVisual({ id, name, image, className }: { id: number; name: string; image?: string | null; className?: string }) {
  if (image) {
    return <img src={image} alt="" loading="lazy" decoding="async" className={cn('bg-surface object-cover', className)} />
  }
  const angle = [45, 135, 60, 120][id % 4]
  const initial = name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '·'
  return (
    <div
      aria-hidden="true"
      className={cn('@container relative flex items-center justify-center overflow-hidden bg-surface', className)}
      style={{
        backgroundImage: `repeating-linear-gradient(${angle}deg, color-mix(in srgb, var(--color-copper) 9%, transparent) 0 8px, transparent 8px 20px)`,
      }}
    >
      <span className="flex aspect-square w-[34cqw] min-w-9 max-w-24 items-center justify-center rounded-full border border-copper/40 bg-surface-raised font-display text-[clamp(1rem,12cqw,2.6rem)] leading-none text-copper-bright shadow-sm">
        {initial}
      </span>
    </div>
  )
}
