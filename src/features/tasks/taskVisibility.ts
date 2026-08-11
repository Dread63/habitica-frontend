import type { DailyTask, TodoTask } from '@/lib/habitica/types'

/**
 * Dailies and todos both carry a `completed` flag, and both can clutter a
 * column once several are done — habits/rewards have no equivalent concept.
 * Default view hides them; a per-column "Show completed" toggle brings them
 * back (see Dashboard.tsx). This is a pure display filter, independent of
 * the actual data fetched — for todos specifically, `GET /tasks/user`
 * already excludes completed ones by default (docs/habitica-api.md), so
 * "show completed" also drives whether the separate completedTodos request
 * fires (useCompletedTodos in useTasks.ts); this function just guards
 * against the transient window where a just-completed todo is still
 * sitting in the main list waiting for that refetch to land.
 */
export function filterCompleted<T extends DailyTask | TodoTask>(tasks: T[], showCompleted: boolean): T[] {
  return showCompleted ? tasks : tasks.filter((task) => !task.completed)
}

/** Todos-only: narrow to tasks that carry a due date, for a "scheduled only" view. */
export function filterScheduledOnly(tasks: TodoTask[], scheduledOnly: boolean): TodoTask[] {
  return scheduledOnly ? tasks.filter((task) => Boolean(task.date)) : tasks
}
