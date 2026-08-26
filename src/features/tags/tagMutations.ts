import { useMutation, useQueryClient } from '@tanstack/react-query'
import { habiticaClient } from '@/lib/habitica/client'
import { usePomodoroStore } from '@/features/pomodoro/pomodoroStore'
import type { Tag, Task } from '@/lib/habitica/types'
import { useTagFilterStore } from './tagFilterStore'

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => habiticaClient.post<Tag>('/tags', { name }),
    onSuccess: (created) => {
      queryClient.setQueryData<Tag[]>(['tags'], (old) => (old ? [...old, created] : [created]))
    },
  })
}

export function useRenameTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, name }: { tagId: string; name: string }) =>
      habiticaClient.put<Tag>(`/tags/${tagId}`, { name }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Tag[]>(['tags'], (old) => old?.map((t) => (t.id === updated.id ? updated : t)))
    },
  })
}

/**
 * Deleting a tag cascades server-side — every task that had it loses it too
 * (docs/habitica-api.md). Mirror that locally rather than waiting on a
 * refetch: strip the tag from the cached task list, and prune it from the
 * filter store (active filter + every saved preset) so the UI doesn't show
 * a filter chip for a tag that no longer exists.
 */
export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) => habiticaClient.delete<Record<string, never>>(`/tags/${tagId}`),
    onMutate: async (tagId) => {
      await queryClient.cancelQueries({ queryKey: ['tags'] })
      const previousTags = queryClient.getQueryData<Tag[]>(['tags'])
      const previousTasks = queryClient.getQueryData<Task[]>(['tasks'])

      queryClient.setQueryData<Tag[]>(['tags'], (old) => old?.filter((t) => t.id !== tagId))
      queryClient.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((task) => (task.tags.includes(tagId) ? { ...task, tags: task.tags.filter((t) => t !== tagId) } : task)),
      )
      useTagFilterStore.getState().pruneTag(tagId)
      // Same cascade for the pomodoro tracked-category set. Past session
      // records keep their tag *snapshots* untouched — category stats are a
      // live intersection with the tracked set, so no history cleanup.
      usePomodoroStore.getState().pruneTrackedTag(tagId)

      return { previousTags, previousTasks }
    },
    onError: (_err, _tagId, context) => {
      if (context?.previousTags) queryClient.setQueryData(['tags'], context.previousTags)
      if (context?.previousTasks) queryClient.setQueryData(['tasks'], context.previousTasks)
      // Not rolling back pruneTag() on error: worst case the user re-picks a
      // filter tag that turned out not to be deleted, which is harmless and
      // simpler than threading the pre-prune filter/preset state through too.
    },
  })
}

export function useReorderTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, to }: { tagId: string; to: number }) =>
      habiticaClient.post<Record<string, never>>('/reorder-tags', { tagId, to }),
    onMutate: async ({ tagId, to }) => {
      await queryClient.cancelQueries({ queryKey: ['tags'] })
      const previous = queryClient.getQueryData<Tag[]>(['tags'])
      queryClient.setQueryData<Tag[]>(['tags'], (old) => {
        if (!old) return old
        const fromIndex = old.findIndex((t) => t.id === tagId)
        if (fromIndex === -1) return old
        const next = [...old]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(to, 0, moved)
        return next
      })
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['tags'], context.previous)
    },
  })
}
