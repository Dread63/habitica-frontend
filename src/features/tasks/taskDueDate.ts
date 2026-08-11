import type { Task } from '@/lib/habitica/types'

/**
 * The single date to show/sort by for a task, or null if it doesn't have
 * one. Habits and rewards never do.
 *
 * - Todos: the optional `date` field — a deadline the user set, not a
 *   recurrence schedule.
 * - Dailies: the first entry of the server-computed `nextDue[]` (see
 *   docs/habitica-api.md). Deliberately NOT re-derived from
 *   frequency/everyX/repeat/startDate client-side — that math is exactly
 *   the kind of cron/day-start-dependent logic CLAUDE.md already flags as
 *   worth trusting the server for (see useScoreTask's reasoning in
 *   taskMutations.ts), and `nextDue` already does it correctly.
 */
export function getDueDate(task: Task): Date | null {
  if (task.type === 'todo' && task.date) return new Date(task.date)
  if (task.type === 'daily' && task.nextDue && task.nextDue.length > 0) return new Date(task.nextDue[0])
  return null
}

/** A todo is "overdue" once its due date has passed and it's still open — dailies
 * aren't considered here, since a due-but-not-yet-completed daily is normal,
 * expected state (that's what "due today" means), not a warning sign. */
export function isOverdue(task: Task): boolean {
  if (task.type !== 'todo' || task.completed) return false
  const due = getDueDate(task)
  return due !== null && due.getTime() < Date.now()
}

/** Compact "Aug 12" / "Aug 12, 2027" (year only shown when it isn't the
 * current one) — a badge-sized label, not a full date. */
export function formatDueDate(date: Date): string {
  const includeYear = date.getFullYear() !== new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: includeYear ? 'numeric' : undefined,
  })
}

/**
 * Stable sort by due date, ascending, with due-less tasks pushed to the end
 * (not the start — "no due date" isn't "most urgent"). Ties (including the
 * common case of two tasks both having no due date) keep their original
 * relative order, since `Array.prototype.sort` is stable per spec.
 */
export function sortTasksByDueDate<T extends Task>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const dueA = getDueDate(a)
    const dueB = getDueDate(b)
    if (dueA === null && dueB === null) return 0
    if (dueA === null) return 1
    if (dueB === null) return -1
    return dueA.getTime() - dueB.getTime()
  })
}
