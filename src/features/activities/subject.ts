import type { Task, TaskType } from '@/lib/habitica/types'

/**
 * A **subject**: something time can be spent on. Either a Habitica task or an
 * app-local *activity* — the IT-support interruption, the hallway conversation,
 * the thing that genuinely happened but was never going to be a to-do.
 *
 * Before this existed, `TimeEntry.taskId` and `TimelineEntry.taskId` were both
 * required Habitica task ids, so a day's log could only be honest about the
 * parts of it that happened to be tasks. Everything else became either an
 * overlong entry on the wrong task or an untracked gap.
 *
 * ## Why an activity reuses the `taskId` field
 *
 * An activity id is a **namespaced string in the same field**, not a new column
 * and not a nullable one. That is deliberate:
 *
 * - Everything that treats the id as an opaque grouping key keeps working with
 *   no change at all — `topTasks`, `aggregateByCategory`, `dailyFocusSeries`,
 *   the lane packer, the CSV export, the sync layer's `(user_id, id)` merge.
 * - Everything that resolves the id to a live `Task` **already** falls back to
 *   the entry's `taskSnapshot` when the lookup misses, because completing a
 *   to-do drops it from `GET /tasks/user`. An activity id simply never
 *   resolves, which is a path that was already load-bearing and already tested.
 * - No persisted field changes shape, so **neither store needs a version bump**
 *   — and a bump without a matching migrate silently discards stored state
 *   (docs/gotchas.md § Persisted stores).
 *
 * The cost is that `taskId` is now more accurately a *subject* id. That
 * mismatch is paid for once, here, rather than by a migration of every record
 * the user has.
 *
 * ## Why the id is derived from the label
 *
 * `activityIdOf('IT support') === activityIdOf('it  support')`. Two entries
 * logged a week apart under the same name are the same subject, so they group
 * into one row in the category charts and the most-tracked list without a
 * single line of new aggregation code. The display text comes from the entry's
 * snapshot, so the casing you typed is what you see.
 *
 * The consequence to know about: **renaming an activity is not a thing.**
 * A different label is a different subject. That is the price of having no
 * activity registry to keep in sync, and it is the right trade for a list that
 * is otherwise pure derived state — see `recentActivities.ts`.
 */
export interface TimeSubject {
  /** A Habitica `Task.id`, or `activity:<normalised label>`. */
  id: string
  text: string
  tagIds: string[]
  /** Absent for activities — they have no Habitica task type. */
  type?: TaskType
}

export const ACTIVITY_ID_PREFIX = 'activity:'

export function isActivityId(id: string): boolean {
  return id.startsWith(ACTIVITY_ID_PREFIX)
}

/**
 * Lowercased, trimmed, internal whitespace collapsed. Returns `''` for a label
 * with no content — callers treat that as "not a usable activity" rather than
 * minting `activity:`.
 */
export function normaliseActivityLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * The id for an activity label, or null when the label is empty. Null rather
 * than a throw, matching `parseDateOnlyString` and the rest of this codebase's
 * pure helpers.
 */
export function activityIdOf(label: string): string | null {
  const normalised = normaliseActivityLabel(label)
  return normalised === '' ? null : ACTIVITY_ID_PREFIX + normalised
}

/** The stored label back out of an id — a last-resort display fallback for an
 * entry whose snapshot is somehow missing. Prefer the snapshot's `text`, which
 * preserves the casing that was typed. */
export function activityLabelOf(id: string): string {
  return isActivityId(id) ? id.slice(ACTIVITY_ID_PREFIX.length) : id
}

export function subjectOfTask(task: Task): TimeSubject {
  return { id: task.id, text: task.text, type: task.type, tagIds: task.tags }
}

/**
 * A subject for an ad-hoc activity, or null if the label is empty.
 *
 * `tagIds` are the app's tracking categories, carried so the category charts
 * and the `--cat-N` colour slots treat an activity exactly like a task. An
 * activity with no tags lands in "Uncategorised", same as a task with none.
 */
export function subjectOfActivity(label: string, tagIds: string[] = []): TimeSubject | null {
  const id = activityIdOf(label)
  if (id === null) return null
  return { id, text: label.trim().replace(/\s+/g, ' '), tagIds }
}

export function isActivitySubject(subject: TimeSubject): boolean {
  return isActivityId(subject.id)
}
