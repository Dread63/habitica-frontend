import { useQuery } from '@tanstack/react-query'
import { habiticaClient } from '@/lib/habitica/client'
import type { Tag } from '@/lib/habitica/types'

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => habiticaClient.get<Tag[]>('/tags'),
    staleTime: 60_000,
  })
}
