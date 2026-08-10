import { useQuery } from '@tanstack/react-query'
import { habiticaClient } from '@/lib/habitica/client'
import type { HabiticaUser } from '@/lib/habitica/types'

/**
 * Trimmed via ?userFields= — GET /user returns the entire user document by
 * default (equipment, party, purchase history, ...), and this app only
 * needs a handful of fields. See docs/habitica-api.md § Base URL for how
 * this param was found (it was a Phase 0 research detour, not obvious from
 * the endpoint's main docs).
 */
const USER_FIELDS = 'stats,preferences.dayStart,preferences.timezoneOffset,profile.name'

export function useUser() {
  return useQuery({
    queryKey: ['user'],
    queryFn: () => habiticaClient.get<HabiticaUser>(`/user?userFields=${USER_FIELDS}`),
    staleTime: 60_000,
  })
}
