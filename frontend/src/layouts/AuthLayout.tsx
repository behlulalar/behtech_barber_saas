import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AuthLayoutProps {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Sol üstte marka adı; verilmezse gösterilmez. */
  brand?: string
}

/** Ortalanmış giriş kartı. dvh kullanır, klavye açıldığında kayabilir. */
export default function AuthLayout({ eyebrow, title, subtitle, children, footer, brand }: AuthLayoutProps) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm">
        {brand && (
          <Link to="/" className="mb-8 block text-center font-display text-lg font-medium text-muted-strong hover:text-cream">
            {brand}
          </Link>
        )}
        <div className="rounded-md border border-line bg-surface p-6 md:p-8">
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h1 className="font-display text-3xl font-medium leading-tight text-cream">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  )
}
