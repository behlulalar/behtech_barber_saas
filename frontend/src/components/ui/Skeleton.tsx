import { cn } from '../../lib/cn'

/** Yüklenirken içerik yerine geçen blok. Boyutu className ile verin (h-4 w-32 gibi). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-shimmer rounded-sm bg-line', className)} />
}

/** Birkaç satırlık metin iskeleti. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} role="status" aria-label="Yükleniyor">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
