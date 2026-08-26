import type { TodoTask } from '@/lib/habitica/types'
import { addDays, startOfDay } from '@/lib/dateOnly'
import { getDueDate } from './taskDueDate'

/**
 * The four columns To-Dos split into when due-date grouping is on.
 * 'today' deliberately covers overdue *and* due-today together — an overdue
 * task and one due in an hour need the same response, and splitting them
 * would put the most urgent work in a column you have to look past.
 */
export type TodoBucket = 'today' | 'week' | 'later' | 'someday'

export const TODO_BUCKET_ORDER: readonly TodoBucket[] = ['today', 'week', 'later', 'someday']

export const TODO_BUCKET_LABELS: Record<TodoBucket, string> = {
  today: 'Today & overdue',
  week: 'This week',
  later: 'Later',
  someday: 'Someday',
}

export const TODO_BUCKET_HINTS: Record<TodoBucket, string> = {
  today: 'Due now or already past',
  week: 'Due in the next 7 days',
  later: 'Due more than a week out',
  someday: 'No due date set',
}

/**
 * `now` is injected rather than read from the clock inside so this stays a
 * pure function — the bucket boundaries are date math with real edge cases
 * (midnight, the 7-day cutoff), and those are only testable if the caller
 * controls "now".
 *
 * "This week" is a rolling next-7-days window, not the calendar week: a
 * calendar week would leave the column nearly empty every Saturday with
 * 'Later' swallowing everything, which makes the split useless exactly when
 * you'd be doing weekend planning.
 */
export function bucketOf(task: TodoTask, now: Date = new Date()): TodoBucket {
  const due = getDueDate(task)
  if (!due) return 'someday'

  const tomorrowStart = addDays(startOfDay(now), 1).getTime()
  // Through the end of the 7th day after today.
  const weekEnd = addDays(startOfDay(now), 8).getTime()

  const dueTime = due.getTime()
  if (dueTime < tomorrowStart) return 'today'
  if (dueTime < weekEnd) return 'week'
  return 'later'
}

/**
 * Sort order within a bucket: soonest due first, then by `value` ascending
 * — Habitica's aging scale, where a lower value is a redder card (see
 * taskColor.ts). So within one deadline, the task you've been neglecting
 * longest floats up. Undated tasks (the whole 'someday' bucket) all tie on
 * the first key and fall through to the color ordering.
 */
export function compareTodos(a: TodoTask, b: TodoTask): number {
  const dueA = getDueDate(a)
  const dueB = getDueDate(b)
  if (dueA && dueB) {
    const diff = dueA.getTime() - dueB.getTime()
    if (diff !== 0) return diff
  } else if (dueA) {
    return -1
  } else if (dueB) {
    return 1
  }
  return a.value - b.value
}

/**
 * Splits todos into the four buckets, each internally sorted by
 * `compareTodos`. Every todo lands in exactly one bucket — nothing is
 * dropped, which is why 'someday' exists rather than undated todos being
 * folded into 'later' (that would present them as scheduled) or hidden.
 */
export function groupTodosByDueDate(
  todos: TodoTask[],
  now: Date = new Date(),
): Record<TodoBucket, TodoTask[]> {
  const buckets: Record<TodoBucket, TodoTask[]> = { today: [], week: [], later: [], someday: [] }
  for (const todo of todos) buckets[bucketOf(todo, now)].push(todo)
  for (const bucket of TODO_BUCKET_ORDER) buckets[bucket].sort(compareTodos)
  return buckets
}
