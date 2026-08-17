import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { habiticaClient } from '@/lib/habitica/client'
import type { CreateTaskInput, HabiticaUser, ScoreTaskResult, Task, UpdateTaskInput } from '@/lib/habitica/types'

function replaceTaskInCache(queryClient: QueryClient, updated: Task) {
  queryClient.setQueryData<Task[]>(['tasks'], (old) => old?.map((t) => (t.id === updated.id ? updated : t)))
}

function removeTaskFromCache(queryClient: QueryClient, taskId: string) {
  queryClient.setQueryData<Task[]>(['tasks'], (old) => old?.filter((t) => t.id !== taskId))
}

/** Score response carries `delta`/`_tmp` alongside the stats fields — keep only what UserStats expects. */
function updateUserStatsInCache(queryClient: QueryClient, result: ScoreTaskResult) {
  queryClient.setQueryData<HabiticaUser>(['user'], (old) =>
    old
      ? {
          ...old,
          stats: {
            hp: result.hp,
            mp: result.mp,
            exp: result.exp,
            gp: result.gp,
            lvl: result.lvl,
            class: result.class,
            points: result.points,
            str: result.str,
            con: result.con,
            int: result.int,
            per: result.per,
          },
        }
      : old,
  )
}

/**
 * Scoring is the one mutation whose response is NOT the task — it's the
 * user's updated stats (docs/habitica-api.md § Footguns). We optimistically
 * flip `completed` for daily/todo so the click feels instant, then always
 * invalidate on settle so streak/history/nextDue — which we deliberately do
 * NOT try to replicate client-side, see CLAUDE.md — come back authoritative
 * from the server instead of drifting from reality over a session.
 */
export function useScoreTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, direction }: { taskId: string; direction: 'up' | 'down' }) =>
      habiticaClient.post<ScoreTaskResult>(`/tasks/${taskId}/score/${direction}`),
    onMutate: async ({ taskId, direction }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])
      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => {
          if (t.id !== taskId) return t
          if (t.type === 'daily' || t.type === 'todo') return { ...t, completed: direction === 'up' }
          return t
        }),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['tasks'], context.previous)
    },
    onSuccess: (result) => updateUserStatsInCache(queryClient, result),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/**
 * New tasks land at the top of their list, not the bottom Habitica's API
 * defaults to. That's not just a local display trick — `move/to/0` (see
 * docs/vendor/tasks.controller.js, `0 = top of the list`) persists the
 * order server-side too, so it survives the next refetch/invalidation
 * instead of the task reverting to wherever the server would otherwise have
 * appended it.
 *
 * The move call is best-effort, deliberately swallowed on failure — this is
 * the fix for a real, confirmed bug: with an unguarded `await`, any failure
 * here (a 429 that outlasts the rate limiter's retries, a transient network
 * blip, anything) rejected the whole mutation, so `onSuccess` never ran and
 * a task that *was* genuinely created server-side (visible on habitica.com)
 * never made it into the local cache — reported as "creates it but doesn't
 * show it in our app." Reordering is a nice-to-have on top of a successful
 * create, not a condition of it actually showing up.
 */
export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const created = await habiticaClient.post<Task>('/tasks/user', input)
      try {
        await habiticaClient.post(`/tasks/${created.id}/move/to/0`)
      } catch {
        // Non-fatal — see comment above. The task still shows, just
        // wherever the server would otherwise have placed it (still
        // corrected on the next full refetch, since ['tasks'] isn't the
        // only thing that keeps the UI in sync over a session).
      }
      return created
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Task[]>(['tasks'], (old) => (old ? [created, ...old] : [created]))
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) =>
      habiticaClient.put<Task>(`/tasks/${taskId}`, input),
    onSuccess: (updated) => replaceTaskInCache(queryClient, updated),
  })
}

/** DeleteTask's response is `{}` (docs/habitica-api.md) — remove from cache ourselves. */
export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => habiticaClient.delete<Record<string, never>>(`/tasks/${taskId}`),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueryData<Task[]>(['tasks'])
      removeTaskFromCache(queryClient, taskId)
      return { previous }
    },
    onError: (_err, _taskId, context) => {
      if (context?.previous) queryClient.setQueryData(['tasks'], context.previous)
    },
  })
}

// Checklist mutations all return the full updated task (confirmed against
// vendor/tasks.controller.js) — no optimistic update needed, just adopt the
// response directly into the cache.

export function useAddChecklistItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, text }: { taskId: string; text: string }) =>
      habiticaClient.post<Task>(`/tasks/${taskId}/checklist`, { text }),
    onSuccess: (updated) => replaceTaskInCache(queryClient, updated),
  })
}

/** Toggles the item's completed state server-side — no request body. */
export function useScoreChecklistItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, itemId }: { taskId: string; itemId: string }) =>
      habiticaClient.post<Task>(`/tasks/${taskId}/checklist/${itemId}/score`),
    onSuccess: (updated) => replaceTaskInCache(queryClient, updated),
  })
}

export function useDeleteChecklistItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, itemId }: { taskId: string; itemId: string }) =>
      habiticaClient.delete<Task>(`/tasks/${taskId}/checklist/${itemId}`),
    onSuccess: (updated) => replaceTaskInCache(queryClient, updated),
  })
}
