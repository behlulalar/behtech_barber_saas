import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi } from './api'

export const INBOX_KEY = ['admin', 'inbox'] as const

/** İşletme paneli bildirim kutusu; 60 sn'de bir yenilenir (okundu bilgisi sunucuda). */
export function useInbox(enabled = true) {
  return useQuery({ queryKey: INBOX_KEY, queryFn: adminApi.getInbox, enabled, staleTime: 30_000, refetchInterval: 60_000, retry: false })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keys: string[] | 'all') => (keys === 'all' ? adminApi.markInboxReadAll() : adminApi.markInboxRead(keys)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: INBOX_KEY }),
  })
}
