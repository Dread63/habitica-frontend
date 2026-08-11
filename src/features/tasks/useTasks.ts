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

/**
 * The default `/tasks/user` response omits completed todos entirely (see
 * docs/habitica-api.md) — a deliberate Habitica API decision, not something
 * client-side filtering can undo. So a "show completed todos" toggle needs
 * this separate request. `enabled` gates it on that toggle actually being
 * on, so it's never fetched otherwise. Shares the `['tasks', ...]` key
 * prefix with `useTasks` on purpose: TanStack Query's default (non-exact)
 * `invalidateQueries({ queryKey: ['tasks'] })` — used after every task
 * mutation — matches both, so this stays in sync for free.
 */
export function useCompletedTodos(enabled: boolean) {
  return useQuery({
    queryKey: ['tasks', 'completedTodos'],
    queryFn: () => habiticaClient.get<Task[]>('/tasks/user?type=completedTodos'),
    enabled,
    staleTime: 60_000,
  })
}
