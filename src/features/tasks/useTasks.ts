import { useQuery } from '@tanstack/react-query'
import { habiticaClient } from '@/lib/habitica/client'
import type { Task } from '@/lib/habitica/types'

/**
 * GET /tasks/user with no `type` param returns habits/dailies/todos/rewards
 * in one call (completed todos beyond what's already in the response need a
 * separate `?type=completedTodos` request — not needed for the Phase 1
 * read-only view). See docs/habitica-api.md.
 */
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => habiticaClient.get<Task[]>('/tasks/user'),
    staleTime: 60_000,
  })
}
