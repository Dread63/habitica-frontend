import * as React from 'react'
import { useTaskLookup } from '@/features/tasks/useTasks'
import { taskSnapshotOf } from './timelineEntries'
import { useTimelineEntryStore } from './timelineEntryStore'

/**
 * Keeps every timeline entry's cached task title/type/tags current.
 *
 * Entries carry a snapshot so a block never degrades to "Deleted task" when
 * Habitica stops returning a task (completing a to-do does exactly that) and
 * so the pomodoro store's timeline suggestion — which runs with no access to
 * the query cache — can read a task's name and tags. A snapshot frozen at
 * scheduling time would go stale on the first rename, hence this.
 *
 * Mounted once in the authed shell (App.tsx) rather than per-page, so a
 * rename made on the Dashboard reaches yesterday's entries too.
 *
 * Uses `useTaskLookup` (which merges the completed-todos query) rather than
 * plain `useTasks`, and that isn't optional: `syncTaskSnapshots` keeps the
 * existing snapshot for any task missing from the map, and a to-do
 * *disappears* from `GET /tasks/user` the moment it's completed. On the
 * plain query a finished to-do would therefore keep `completed: false`
 * forever — which is exactly the state that had the timer proposing a
 * finished task for the next focus phase. The cost is one extra request per
 * stale window, deduped and shared with the Dashboard's "Show completed"
 * toggle.
 */
export function useTimelineSnapshotSync(): void {
  const tasksById = useTaskLookup()
  const syncSnapshots = useTimelineEntryStore((s) => s.syncSnapshots)

  React.useEffect(() => {
    if (tasksById.size === 0) return
    syncSnapshots(new Map([...tasksById].map(([id, task]) => [id, taskSnapshotOf(task)])))
  }, [tasksById, syncSnapshots])
}
