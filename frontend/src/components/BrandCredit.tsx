import { cn } from '../lib/cn'

export const LINKEDIN_URL = 'https://www.linkedin.com/company/behtechlabs'

/** Alt bilgi imzası: "© 2026 BehTech · BehTech Altyapısıyla Randevu Sistemi" (BehTech'ler LinkedIn sayfasına gider). */
export function BrandCredit({ className }: { className?: string }) {
  const link = 'underline-offset-4 transition-colors hover:text-cream hover:underline'
  return (
    <p className={cn(className)}>
      © {new Date().getFullYear()}{' '}
      <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className={link}>
        BehTech
      </a>{' '}
      ·{' '}
      <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className={link}>
        BehTech
      </a>{' '}
      Altyapısıyla Randevu Sistemi
    </p>
  )
}
