import { cn } from '../../lib/cn'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

const SIZES = { sm: 'size-4', md: 'size-6', lg: 'size-9' }

export function Spinner({ size = 'md', label = 'Yükleniyor', className }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center justify-center text-copper', className)}>
      <svg className={cn('animate-spin', SIZES[size])} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}
