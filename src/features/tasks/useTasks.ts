import { useMemo } from 'react'
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

/**
 * Every task the app can resolve by id, *including completed to-dos* —
 * needed anywhere a stored id has to survive being ticked off.
 *
 * This exists because of a real bug: completing a scheduled to-do made its
 * timeline block render as "Deleted task". The cause isn't deletion at all —
 * `GET /tasks/user` simply stops returning a to-do once it's complete (see
 * `useCompletedTodos`), so any feature holding an id (timeline placements,
 * pomodoro links) lost the ability to name it. Merging both queries fixes
 * the lookup at the source instead of special-casing the symptom in each
 * renderer.
 *
 * Costs one extra request per stale window on pages that call it — well
 * inside the 30/60s rate limit, deduped by TanStack Query, and it warms the
 * cache the Dashboard's "Show completed" toggle reads from. Callers that
 * only need open tasks (the pomodoro task picker) should stay on `useTasks`.
 */
export function useTaskLookup(): ReadonlyMap<string, Task> {
  const tasksQuery = useTasks()
  const completedQuery = useCompletedTodos(true)
  return useMemo(() => {
    const map = new Map<string, Task>()
    for (const task of completedQuery.data ?? []) map.set(task.id, task)
    // Open tasks win any id collision — they're the authoritative copy.
    for (const task of tasksQuery.data ?? []) map.set(task.id, task)
    return map
  }, [tasksQuery.data, completedQuery.data])
}
