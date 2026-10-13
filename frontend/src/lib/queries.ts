import { useQuery } from '@tanstack/react-query'
import { publicApi } from './api'

/** Tenant (işletme) bilgisi: ad, adres, logo, banner. Tüm sayfalarda önbellekten gelir. */
export function useTenant() {
  return useQuery({
    queryKey: ['public', 'tenant'],
    queryFn: publicApi.getTenant,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
