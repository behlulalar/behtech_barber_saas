import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Skeleton } from './Skeleton'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** Mobil kartta başlık olarak (üstte, büyük) gösterilir. Bir sütunda true olmalı. */
  primary?: boolean
  /** Mobil kartta hiç gösterme. */
  hideOnMobile?: boolean
  align?: 'left' | 'right' | 'center'
  /** Masaüstü th/td için ek sınıf (genişlik vb.). */
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  loading?: boolean
  empty?: ReactNode
  /** Erişilebilirlik için tablo açıklaması */
  caption?: string
  /** Mobil kartta sağ üst köşede gösterilecek eylem alanı */
  mobileActions?: (row: T) => ReactNode
  className?: string
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' }

/**
 * Masaüstünde klasik tablo (gerekirse kendi içinde yatay kayar),
 * mobilde (<md) her satır bir kart olarak yığılır: yatay taşma olmaz.
 */
export function Table<T>({ columns, rows, rowKey, onRowClick, loading, empty, caption, mobileActions, className }: TableProps<T>) {
  const primary = columns.find((c) => c.primary) ?? columns[0]
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile)

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-2', className)} role="status" aria-label="Yükleniyor">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return <div className={cn('rounded-md border border-dashed border-panel-line', className)}>{empty}</div>
  }

  return (
    <div className={className}>
      {/* Masaüstü */}
      <div className="hidden overflow-x-auto rounded-md border border-panel-line md:block">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-panel-line bg-panel-raised/60">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn('whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-[0.1em] text-muted', ALIGN[c.align ?? 'left'], c.className)}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-b border-panel-line last:border-0', onRowClick && 'cursor-pointer transition-colors hover:bg-panel-hover')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-middle text-cream', ALIGN[c.align ?? 'left'], c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil: yığılmış kartlar */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {rows.map((row) => {
          const content = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 break-words font-medium text-cream">{primary.cell(row)}</div>
                {mobileActions?.(row)}
              </div>
              {rest.length > 0 && (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  {rest.map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-muted">{c.header}</dt>
                      <dd className="min-w-0 break-words text-right text-cream">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )
          return (
            <li key={rowKey(row)}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className="block w-full rounded-md border border-panel-line bg-panel p-4 text-left active:bg-panel-hover"
                >
                  {content}
                </button>
              ) : (
                <div className="rounded-md border border-panel-line bg-panel p-4">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
