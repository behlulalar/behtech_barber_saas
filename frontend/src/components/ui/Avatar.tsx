import { cn } from '../../lib/cn'
import { initials } from '../../lib/format'

const SIZES = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-20 text-2xl' }

interface AvatarProps {
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  className?: string
}

/** Fotoğraf yoksa baş harfler (Fraunces) gösterir. Kare oranlı, layout shift yok. */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface-raised font-display font-medium text-copper-bright',
        SIZES[size],
        className,
      )}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" loading="lazy" />
      ) : (
        initials(name)
      )}
    </span>
  )
}
