import { parseDateOnlyString } from '@/lib/dateOnly'
import { MINUTES_PER_DAY } from '@/lib/timeOfDay'
import type { Task, TaskType } from '@/lib/habitica/types'

/**
 * Title/type/tags as of the last time the live task was seen, carried on the
 * entry itself. Two things need it:
 *
 * 1. **Completing a to-do makes Habitica drop it from `GET /tasks/user`**
 *    entirely (completed todos only come back from a separate
 *    `?type=completedTodos` request — see useTasks.ts). Without a snapshot,
 *    ticking off a scheduled to-do turned its timeline block into "Deleted
 *    task", which is both wrong and alarming. The page merges the
 *    completed-todos query too, so live data usually wins; this is the
 *    belt-and-braces fallback that also covers the fetch gap on first paint
 *    and a task deleted from habitica.com directly (which never runs this
 *    app's `pruneTask` cascade).
 * 2. `suggestedTaskRef` runs inside the pomodoro store, which has no access
 *    to the React Query cache — it reads a task's name and tags straight off
 *    these snapshots.
 *
 * This used to also carry a `completedAt` instant, so focus attribution could
 * clip a block at the moment its task was ticked off. Attribution is gone —
 * time is recorded as it happens now (features/tracking) — and with it the
 * only reason that field existed. Removing it needed no store version bump:
 * an unread key left in stored JSON is harmless and disappears the next time
 * `syncTaskSnapshots` rewrites the entry.
 *
 * Kept fresh by `syncTaskSnapshots` whenever tasks load, so a rename or
 * re-tag propagates rather than freezing at creation time.
 */
export interface TimelineTaskSnapshot {
  text: string
  type: TaskType
  tagIds: string[]
  /**
   * Whether the task was done the last time this app saw it. Blocks for
   * finished work stay on the timeline on purpose (reviewing the day is half
   * the point) but must never be auto-linked to a *new* focus session — see
   * `focusCandidateEntries`. Optional only because entries stored before
   * snapshots existed have no value for it; `syncTaskSnapshots` fills it in.
   */
  completed?: boolean
}

/**
 * One placement of a task on a specific calendar day's timeline. Local-only
 * — never sent to Habitica's API (which has no concept of this), and never
 * attached to the Task object itself: `lib/habitica/types.ts` is a strict
 * mirror of Habitica's shapes, so timeline state lives here and is joined
 * against live task data by `taskId` at render time only.
 *
 * One-off per date, not a recurring template — scheduling the same daily on
 * three days means three separate entries. Decided explicitly (via
 * AskUserQuestion) over a recurring "usual time" model: no
 * override/exception system needed.
 */
export interface TimelineEntry {
  id: string
  /** Task.id — may point at any schedulable type (habit/daily/todo). */
  taskId: string
  /** Local calendar day, "YYYY-MM-DD" (dateOnly.ts conventions). */
  date: string
  /** Minutes since local midnight of `date`, 0–1439. */
  startMinutes: number
  /** Always > 0; entries stay within their day (start + duration <= 1440). */
  durationMinutes: number
  /** ISO instant — stable sort tie-break only, never sent anywhere. */
  createdAt: string
  /**
   * ms epoch of the last change to this entry. This is the sync layer's
   * conflict rule: when the same placement was edited on two devices, the
   * higher `updatedAt` wins (see lib/sync/mergeState.ts and the server's
   * matching `WHERE updated_at <= excluded.updated_at`). Stamped by the
   * store on every write rather than by the pure helpers below, so there is
   * exactly one place that can forget to set it.
   */
  updatedAt: number
  /** Undefined only for entries created before snapshots existed (v1). */
  taskSnapshot?: TimelineTaskSnapshot
}

export const TIMELINE_MIN_DURATION_MINUTES = 5
export const TIMELINE_DEFAULT_DURATION_MINUTES = 30
/** Drag/placement snap granularity. */
export const TIMELINE_GRID_MINUTES = 15

/** Clamp a raw minutes value into the day, [0, 1439]. */
export function clampStartMinutes(minutes: number): number {
  return Math.min(Math.max(Math.round(minutes), 0), MINUTES_PER_DAY - 1)
}

/** Round to the nearest grid increment (still clamp separately if needed). */
export function snapToGrid(minutes: number, gridMinutes: number = TIMELINE_GRID_MINUTES): number {
  return Math.round(minutes / gridMinutes) * gridMinutes
}

/**
 * "Now, rounded up to the next grid slot" — the default start for
 * send-to-timeline actions. Capped so a default-length block placed late at
 * night still fits inside the day.
 */
export function nextGridStart(nowMinutes: number): number {
  return Math.min(
    Math.ceil(nowMinutes / TIMELINE_GRID_MINUTES) * TIMELINE_GRID_MINUTES,
    MINUTES_PER_DAY - TIMELINE_DEFAULT_DURATION_MINUTES,
  )
}

function clampDuration(startMinutes: number, durationMinutes: number): number {
  // Entries can't cross midnight (one-off *per day* is the whole model) —
  // duration is capped to what's left of the day after `startMinutes`.
  const max = MINUTES_PER_DAY - startMinutes
  return Math.min(Math.max(Math.round(durationMinutes), TIMELINE_MIN_DURATION_MINUTES), max)
}

/** `id`/`createdAt` injectable for deterministic tests, same pattern as
 * todoBuckets.ts taking `now` as a parameter. */
export function createTimelineEntry(
  params: {
    taskId: string
    date: string
    startMinutes: number
    durationMinutes: number
    taskSnapshot?: TimelineTaskSnapshot
  },
  id: string = crypto.randomUUID(),
  createdAt: string = new Date().toISOString(),
  updatedAt: number = Date.now(),
): TimelineEntry {
  const startMinutes = clampStartMinutes(params.startMinutes)
  return {
    id,
    taskId: params.taskId,
    date: params.date,
    startMinutes,
    durationMinutes: clampDuration(startMinutes, params.durationMinutes),
    createdAt,
    updatedAt,
    taskSnapshot: params.taskSnapshot,
  }
}

export function taskSnapshotOf(task: Task): TimelineTaskSnapshot {
  return {
    text: task.text,
    type: task.type,
    tagIds: task.tags,
    // Habits have no `completed` field at all — absent means "never done",
    // not "unknown", so a plain false is correct rather than undefined.
    completed: 'completed' in task ? task.completed === true : false,
  }
}

/**
 * Refresh every entry's snapshot from the live task list, returning the same
 * array reference when nothing changed so callers can use it in an effect
 * without looping. Tasks absent from `snapshots` (a completed to-do missing
 * from the default fetch, a deleted task) keep whatever snapshot they had —
 * this only ever writes fresher data, never erases it.
 */
export function syncTaskSnapshots(
  entries: TimelineEntry[],
  snapshots: ReadonlyMap<string, TimelineTaskSnapshot>,
): TimelineEntry[] {
  let changed = false
  const next = entries.map((entry) => {
    const incoming = snapshots.get(entry.taskId)
    if (!incoming) return entry
    const old = entry.taskSnapshot
    const fresh = incoming
    if (
      old &&
      old.text === fresh.text &&
      old.type === fresh.type &&
      old.completed === fresh.completed &&
      old.tagIds.length === fresh.tagIds.length &&
      old.tagIds.every((t, i) => t === fresh.tagIds[i])
    ) {
      return entry
    }
    changed = true
    return { ...entry, taskSnapshot: fresh }
  })
  return changed ? next : entries
}

/**
 * The entry's wall-clock interval as real instants — the bridge from the
 * timeline's (date, minutes-since-midnight) model into the absolute
 * timestamps the plan-vs-actual comparison works in. Returns null for an
 * unparseable date rather than guessing.
 */
export function entryInterval(entry: TimelineEntry): { start: number; end: number } | null {
  const day = parseDateOnlyString(entry.date)
  if (day === null) return null
  const start = new Date(day)
  start.setHours(Math.floor(entry.startMinutes / 60), entry.startMinutes % 60, 0, 0)
  return { start: start.getTime(), end: start.getTime() + entry.durationMinutes * 60_000 }
}

/** Entries for one calendar day, sorted by start time (then createdAt for a
 * stable order between same-start entries). */
export function entriesForDate(entries: TimelineEntry[], date: string): TimelineEntry[] {
  return entries
    .filter((e) => e.date === date)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.createdAt.localeCompare(b.createdAt))
}

export function entryForTaskOnDate(
  entries: TimelineEntry[],
  taskId: string,
  date: string,
): TimelineEntry | undefined {
  return entries.find((e) => e.taskId === taskId && e.date === date)
}

/** Pure reposition — clamps so the entry keeps its duration and stays inside the day. */
export function moveEntry(entry: TimelineEntry, newStartMinutes: number): TimelineEntry {
  const start = Math.min(
    clampStartMinutes(newStartMinutes),
    MINUTES_PER_DAY - entry.durationMinutes,
  )
  return { ...entry, startMinutes: start }
}

/** Pure resize — clamps to [min duration, rest of the day]. */
export function resizeEntry(entry: TimelineEntry, newDurationMinutes: number): TimelineEntry {
  return { ...entry, durationMinutes: clampDuration(entry.startMinutes, newDurationMinutes) }
}

/**
 * Pure move-across-days: date, start and duration in one step, keeping the
 * entry's identity. `moveEntry`/`resizeEntry` only ever change *when within a
 * day* a block sits, which is all the drag interactions need — but the
 * schedule form can change the day too, and doing that by creating a fresh
 * entry left the original behind as a duplicate.
 */
export function rescheduleEntry(
  entry: TimelineEntry,
  date: string,
  startMinutes: number,
  durationMinutes: number,
): TimelineEntry {
  const start = clampStartMinutes(startMinutes)
  return { ...entry, date, startMinutes: start, durationMinutes: clampDuration(start, durationMinutes) }
}

/**
 * The entry that's live right now (start <= now < end — if several overlap,
 * the most recently started, i.e. the thing you presumably switched to), or
 * failing that the next upcoming one — drives the pomodoro panel's
 * auto-selected focus task. Expects one day's entries (entriesForDate).
 */
export function currentOrNextEntry(entries: TimelineEntry[], nowMinutes: number): TimelineEntry | undefined {
  let live: TimelineEntry | undefined
  for (const e of entries) {
    if (e.startMinutes <= nowMinutes && nowMinutes < e.startMinutes + e.durationMinutes) live = e
  }
  return live ?? entries.find((e) => e.startMinutes > nowMinutes)
}

/**
 * Every entry that overlaps the window [now, now + windowMinutes) — i.e.
 * everything you'd plausibly touch during the *next pomodoro session*:
 * blocks live right now plus blocks starting before the session would end.
 * Drives the panel's multi-task auto-selection. Expects one day's entries
 * (entriesForDate), so the result keeps that start-time order.
 */
export function entriesInWindow(
  entries: TimelineEntry[],
  nowMinutes: number,
  windowMinutes: number,
): TimelineEntry[] {
  const windowEnd = nowMinutes + windowMinutes
  return entries.filter((e) => e.startMinutes < windowEnd && nowMinutes < e.startMinutes + e.durationMinutes)
}

/**
 * The blocks a *new* focus session should link itself to: everything
 * overlapping the session's window, falling back to the next upcoming block
 * when the window is empty — minus anything already finished.
 *
 * That exclusion is the whole reason this exists as its own function rather
 * than a bare `entriesInWindow` call. A block whose task is done stays on the
 * timeline deliberately (it's a record of the day), and it keeps its name
 * from `taskSnapshot` even after Habitica stops returning the task. Both of
 * those are right for *rendering* and both were wrong for *auto-selection*:
 * finishing a task early and scheduling its successor in the same slot left
 * the timer proposing the finished one. Completion is read from the snapshot
 * rather than live task data so this stays pure and usable from the store,
 * which has no query cache; entries with no snapshot yet are treated as open,
 * since "unknown" shouldn't hide a block from you.
 *
 * Expects one day's entries (entriesForDate), so results keep start order.
 */
export function focusCandidateEntries(
  entries: TimelineEntry[],
  nowMinutes: number,
  windowMinutes: number,
): TimelineEntry[] {
  const open = entries.filter((e) => e.taskSnapshot?.completed !== true)
  const inWindow = entriesInWindow(open, nowMinutes, windowMinutes)
  if (inWindow.length > 0) return inWindow
  const next = currentOrNextEntry(open, nowMinutes)
  return next ? [next] : []
}

/** Drop every entry for a task — the task-deleted cascade (see timelineEntryStore.pruneTask). */
export function removeEntriesForTask(entries: TimelineEntry[], taskId: string): TimelineEntry[] {
  return entries.filter((e) => e.taskId !== taskId)
}
