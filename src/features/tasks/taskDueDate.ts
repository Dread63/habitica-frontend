import type { Task } from '@/lib/habitica/types'
import { today } from '@/lib/dateOnly'

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
 *
 * Both read with a plain `new Date(...)` — no UTC-component juggling. That
 * used to not be true for todos, and getting it wrong once is worth
 * recording: an earlier version of this function read a todo's `date` via
 * its *UTC* components, on the theory that Habitica stores it as bare UTC
 * midnight. That was only true because this app's *write* side (the date
 * picker / quick-add) was, at the time, sending a bare "YYYY-MM-DD" string
 * — self-consistent within this app, but incompatible with habitica.com's
 * own frontend, which sends a real timestamp for local midnight (like any
 * ordinary JS date picker) and reads it back with plain local `Date`
 * methods. A user cross-checking a task created here against habitica.com
 * caught it: the date was wrong *there*, meaning the bug was in what this
 * app sent, not how it read the result back. The real fix moved to the
 * write side — `toApiDateTime` in `lib/dateOnly.ts`, used everywhere this
 * app sets a due date (`TaskEditorDialog`, `QuickAddBar`, `TodoBoard`'s
 * drag-and-drop) — so the stored instant now matches Habitica's own
 * convention, and this function can go back to the plain, obvious read.
 */
export function getDueDate(task: Task): Date | null {
  if (task.type === 'todo' && task.date) return new Date(task.date)
  if (task.type === 'daily' && task.nextDue && task.nextDue.length > 0) return new Date(task.nextDue[0])
  return null
}

/**
 * A todo is "overdue" once its due *calendar day* has fully passed and it's
 * still open — compared by calendar day (due day strictly before today),
 * not raw timestamps. A task due today isn't overdue yet at 9am; the old
 * `due.getTime() < Date.now()` check compared a midnight instant against
 * the current instant, which meant anything due "today" started reading as
 * overdue the moment the clock ticked past midnight — compounding the
 * display bug above rather than being independent of it. Dailies aren't
 * considered here at all — a due-but-not-yet-completed daily is normal,
 * expected state (that's what "due today" means), not a warning sign.
 */
export function isOverdue(task: Task): boolean {
  if (task.type !== 'todo' || task.completed) return false
  const due = getDueDate(task)
  return due !== null && due.getTime() < today().getTime()
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
