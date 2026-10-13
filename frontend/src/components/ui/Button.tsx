import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface StyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-copper text-ink font-semibold hover:bg-copper-bright active:bg-copper-deep disabled:hover:bg-copper',
  secondary:
    'border border-line-strong bg-transparent text-cream hover:border-copper hover:text-copper-bright active:bg-copper/10',
  ghost: 'text-muted-strong hover:bg-cream/5 hover:text-cream active:bg-cream/10',
  danger:
    'border border-danger/50 bg-danger/10 text-danger hover:bg-danger hover:text-ink active:bg-danger/80',
}

// Dokunmatik hedef: mobilde en az 44px, masaüstünde sm daha kompakt olabilir.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-4 text-sm md:min-h-9 md:px-3.5',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-12 px-7 text-base',
}

/** Link / a gibi öğeleri buton gibi göstermek için: <Link className={buttonStyles({...})}>. */
export function buttonStyles({ variant = 'primary', size = 'md', fullWidth, className }: StyleOptions = {}): string {
  return cn(
    'relative inline-flex select-none items-center justify-center gap-2 rounded-sm font-medium tracking-wide transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  )
}

interface ButtonProps extends Omit<ComponentProps<'button'>, 'className'>, StyleOptions {
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export function Button({
  variant,
  size,
  fullWidth,
  className,
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...rest}
    >
      <span className={cn('inline-flex items-center justify-center gap-2', loading && 'invisible')}>
        {leftIcon}
        {children}
        {rightIcon}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" className="text-current" />
        </span>
      )}
    </button>
  )
}

/** Sadece ikon içeren buton (aria-label zorunlu). 44px dokunmatik hedef. */
export function IconButton({
  label,
  className,
  children,
  type = 'button',
  ...rest
}: Omit<ComponentProps<'button'>, 'className' | 'aria-label'> & { label: string; className?: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-strong transition-colors hover:bg-cream/5 hover:text-cream active:bg-cream/10 disabled:opacity-45 md:size-10',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
