import { addDays, parseDateOnlyString, toDateOnlyString } from '@/lib/dateOnly'
import type { Task, TaskType } from '@/lib/habitica/types'

/**
 * The time ledger: what was actually worked on, when.
 *
 * This replaces an inference with a record. The previous model kept a
 * *plan* (timeline blocks) and a *clock* (pomodoro segments) as separate
 * things and reconstructed "what was I doing" by overlaying them at phase
 * end. That was wrong in a specific, compounding way: editing the plan
 * retroactively rewrote history, so moving a block at minute 20 re-attributed
 * minutes 0–20 as well, and a task linked at minute 24 claimed a share of
 * everything before it.
 *
 * Here, an interval is opened when you start on something and closed when you
 * stop or switch. A minute, once elapsed, belongs to whoever owned it at the
 * time and **no later edit to the plan can move it**. Totals become a sum
 * rather than a computation, which is why there is no attribution module any
 * more and no even-splitting anywhere in the system.
 *
 * Entries are *editable* (you will forget to switch), so this is a mutable
 * record set with an immutable audit trail — structurally the same
 * last-write-wins + tombstones shape as timelineEntryStore, not the
 * append-only shape used for pomodoro phases. Do not reach for
 * `INSERT OR IGNORE` on these: it would silently drop a corrected end time
 * and leave two devices permanently divergent with no error anywhere.
 */

/** What the pointer points at. Replaces the old PomodoroTaskRef — the timer
 * no longer owns task identity, the ledger does. */
export interface TimeEntryTaskRef {
  id: string
  text: string
  type: TaskType
  tagIds: string[]
}

/**
 * Frozen at open. A strict subset of TimelineTaskSnapshot — deliberately no
 * `completed`/`completedAt`, because an entry is a record of the past and has
 * no liveness left to track.
 */
export interface TimeEntryTaskSnapshot {
  text: string
  type: TaskType
  tagIds: string[]
}

export type TimeEntrySource = 'manual' | 'pomodoro'

/**
 * Why an interval ended. Distinct from `audit` on purpose: an end time
 * *reconstructed* by the idle prompt is not the same claim as one you typed,
 * and the export can say which.
 */
export type TimeEntryClosedBy = 'user' | 'phase' | 'switch' | 'reconciled'

export interface TimeEntryAudit {
  /** Values as first recorded. Written on the FIRST edit only, never again —
   * that is what makes the export trustworthy. */
  original: { taskId: string; startedAt: string; endedAt: string | null }
  editedAt: string
  editCount: number
}

export interface TimeEntry {
  id: string
  taskId: string
  /** ISO instant. */
  startedAt: string
  /** ISO instant, or null while this is *the* open entry. */
  endedAt: string | null
  taskSnapshot: TimeEntryTaskSnapshot
  source: TimeEntrySource
  closedBy?: TimeEntryClosedBy
  /** Set at open, never changed — links to a PomodoroPhaseRecord. */
  phaseId?: string
  /** Set on the second half of a split; points at the entry it came from. */
  splitFromId?: string
  audit?: TimeEntryAudit
  /** Set once the idle prompt has been answered, so it is never asked twice. */
  reviewedAt?: string
  createdAt: string
  /** ms epoch — the sync layer's LWW rule. Stamped by the store, never here. */
  updatedAt: number
}

export interface TimeEntryState {
  entries: TimeEntry[]
  /** entryId -> ms epoch of deletion. Same reasoning as the timeline store's:
   * without tombstones a device that was offline during a delete pushes its
   * live copy back and resurrects the entry. */
  tombstones: Record<string, number>
}

/**
 * Intervals shorter than this are dropped rather than recorded — a misclick,
 * or a start immediately followed by a switch. Mirrors `closeSegments`'
 * existing "a zero/negative slice is dropped rather than recorded as a
 * backwards interval" guard.
 *
 * Deliberately *much* smaller than the 60s floor the old session model used:
 * discarding a considered 40-second interval is wrong for a real tracker,
 * while discarding a 2-second one is right.
 */
export const MIN_ENTRY_MS = 5_000

export const EMPTY_TIME_ENTRY_STATE: TimeEntryState = { entries: [], tombstones: {} }

export function timeEntrySnapshotOf(task: Task): TimeEntryTaskSnapshot {
  return { text: task.text, type: task.type, tagIds: task.tags }
}

export function taskRefOf(task: Task): TimeEntryTaskRef {
  return { id: task.id, text: task.text, type: task.type, tagIds: task.tags }
}

// ---------------------------------------------------------------------------
// Derived values. Never stored — two representations of one fact is the exact
// disease this rework exists to cure.
// ---------------------------------------------------------------------------

export function isOpen(entry: TimeEntry): boolean {
  return entry.endedAt === null
}

/** An open entry measures to `now`. */
export function entryEndMs(entry: TimeEntry, now: Date): number {
  return entry.endedAt === null ? now.getTime() : Date.parse(entry.endedAt)
}

export function entryDurationMs(entry: TimeEntry, now: Date): number {
  return Math.max(0, entryEndMs(entry, now) - Date.parse(entry.startedAt))
}

export function wasEdited(entry: TimeEntry): boolean {
  return entry.audit !== undefined
}

/** The open entry, or undefined. Returns the most recently started one if
 * state is somehow corrupt, so a bad state renders rather than throws. */
export function openEntryOf(entries: TimeEntry[]): TimeEntry | undefined {
  let found: TimeEntry | undefined
  for (const entry of entries) {
    if (!isOpen(entry)) continue
    if (!found || Date.parse(entry.startedAt) > Date.parse(found.startedAt)) found = entry
  }
  return found
}

export function totalDurationMs(entries: TimeEntry[], now: Date): number {
  return entries.reduce((sum, entry) => sum + entryDurationMs(entry, now), 0)
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

/**
 * The **only** way an entry is opened, and therefore the single place the
 * "at most one open entry" invariant lives. It always closes whatever is open
 * first, at `now`, so a gap or an overlap between live-tracked intervals is
 * structurally impossible rather than merely avoided by callers.
 *
 * Idempotent: reopening the same task in the same phase while it is already
 * open returns the *same state object*. That matters because PomodoroPanel is
 * mounted twice simultaneously and StrictMode double-invokes effects, so a
 * naive implementation would litter the ledger with duplicate one-tick
 * intervals.
 */
export function startTracking(
  state: TimeEntryState,
  params: {
    task: TimeEntryTaskRef
    source: TimeEntrySource
    phaseId?: string
  },
  now: Date,
  id: string = crypto.randomUUID(),
): TimeEntryState {
  const open = openEntryOf(state.entries)
  if (open && open.taskId === params.task.id && open.phaseId === params.phaseId) return state

  const closed = open ? stopTracking(state, now, 'switch') : state
  const iso = now.toISOString()
  return {
    ...closed,
    entries: [
      ...closed.entries,
      {
        id,
        taskId: params.task.id,
        startedAt: iso,
        endedAt: null,
        taskSnapshot: { text: params.task.text, type: params.task.type, tagIds: params.task.tagIds },
        source: params.source,
        phaseId: params.phaseId,
        createdAt: iso,
        updatedAt: now.getTime(),
      },
    ],
  }
}

/**
 * Closes the open entry, if any. A resulting interval shorter than
 * MIN_ENTRY_MS is dropped entirely rather than recorded.
 */
export function stopTracking(state: TimeEntryState, at: Date, closedBy: TimeEntryClosedBy): TimeEntryState {
  const open = openEntryOf(state.entries)
  if (!open) return state

  const endMs = at.getTime()
  if (endMs - Date.parse(open.startedAt) < MIN_ENTRY_MS) {
    return { ...state, entries: state.entries.filter((e) => e.id !== open.id) }
  }
  return {
    ...state,
    entries: state.entries.map((e) =>
      e.id === open.id ? { ...e, endedAt: at.toISOString(), closedBy, updatedAt: endMs } : e,
    ),
  }
}

/**
 * Normalises foreign state. Runs inside the persist migrate and when a sync
 * response is applied — anywhere state arrives that this module didn't build,
 * and therefore anywhere the one-open-entry invariant could have been
 * violated. Keeps the most recently started open entry and closes the rest at
 * their successor's start, which is the only close time that doesn't invent
 * duration out of nothing.
 */
export function closeStrayOpenEntries(state: TimeEntryState, now: Date): TimeEntryState {
  const open = state.entries.filter(isOpen).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  if (open.length <= 1) return state

  const keep = open[open.length - 1]
  const closeAt = new Map<string, number>()
  for (let i = 0; i < open.length - 1; i++) closeAt.set(open[i].id, Date.parse(open[i + 1].startedAt))

  return {
    ...state,
    entries: state.entries
      .map((entry) => {
        const end = closeAt.get(entry.id)
        if (end === undefined || entry.id === keep.id) return entry
        return { ...entry, endedAt: new Date(end).toISOString(), closedBy: 'reconciled' as const, updatedAt: now.getTime() }
      })
      // A stray that closes to nothing was never a real interval.
      .filter((entry) => isOpen(entry) || entryDurationMs(entry, now) >= MIN_ENTRY_MS),
  }
}

export interface TimeEntryEdit {
  taskId?: string
  taskSnapshot?: TimeEntryTaskSnapshot
  startedAt?: string
  endedAt?: string | null
}

/**
 * Hand-correct an entry. The first edit captures `audit.original`; later
 * edits bump `editCount` but **never overwrite the original** — the whole
 * point of the audit trail is that it records what was captured live, not
 * what it was most recently changed from.
 */
export function editEntry(
  state: TimeEntryState,
  entryId: string,
  edit: TimeEntryEdit,
  now: Date,
): TimeEntryState {
  return {
    ...state,
    entries: state.entries.map((entry) => {
      if (entry.id !== entryId) return entry
      return {
        ...entry,
        ...edit,
        audit: {
          original: entry.audit?.original ?? {
            taskId: entry.taskId,
            startedAt: entry.startedAt,
            endedAt: entry.endedAt,
          },
          editedAt: now.toISOString(),
          editCount: (entry.audit?.editCount ?? 0) + 1,
        },
        updatedAt: now.getTime(),
      }
    }),
  }
}

/**
 * Split an interval at `at` — "the first half was actually a different task".
 * Conserves total duration exactly and leaves no gap. Neither half is marked
 * edited: nothing was misstated, the interval was only subdivided.
 */
export function splitEntry(
  state: TimeEntryState,
  entryId: string,
  at: Date,
  now: Date,
  newId: string = crypto.randomUUID(),
): TimeEntryState {
  const entry = state.entries.find((e) => e.id === entryId)
  if (!entry) return state
  const atMs = at.getTime()
  const startMs = Date.parse(entry.startedAt)
  const endMs = entryEndMs(entry, now)
  if (atMs - startMs < MIN_ENTRY_MS || endMs - atMs < MIN_ENTRY_MS) return state

  const iso = at.toISOString()
  const second: TimeEntry = {
    ...entry,
    id: newId,
    startedAt: iso,
    endedAt: entry.endedAt,
    splitFromId: entry.id,
    createdAt: now.toISOString(),
    updatedAt: now.getTime(),
  }
  return {
    ...state,
    entries: [
      ...state.entries.map((e) =>
        e.id === entryId ? { ...e, endedAt: iso, closedBy: 'user' as const, updatedAt: now.getTime() } : e,
      ),
      second,
    ],
  }
}

export function deleteEntry(state: TimeEntryState, entryId: string, now: Date): TimeEntryState {
  if (!state.entries.some((e) => e.id === entryId)) return state
  return {
    entries: state.entries.filter((e) => e.id !== entryId),
    tombstones: { ...state.tombstones, [entryId]: now.getTime() },
  }
}

/**
 * Close the open entry if it belongs to a task that no longer exists.
 *
 * **Deliberately not a cascade delete**, unlike `timelineEntryStore.pruneTask`
 * and `tagFilterStore.pruneTag`. Deleting a task must not erase the record of
 * time you spent on it — that record is the whole point of this feature, and
 * the snapshot means it stays readable without the task. Please don't
 * "fix" this into consistency with the other prune functions.
 */
export function handleTaskDeleted(state: TimeEntryState, taskId: string, now: Date): TimeEntryState {
  const open = openEntryOf(state.entries)
  if (!open || open.taskId !== taskId) return state
  return stopTracking(state, now, 'user')
}

// ---------------------------------------------------------------------------
// Reading by day
// ---------------------------------------------------------------------------

/** Local-day bounds. Built with dateOnly helpers rather than +86_400_000 so a
 * DST transition doesn't shift the boundary by an hour. */
function dayBounds(date: string): { start: number; end: number } | null {
  const day = parseDateOnlyString(date)
  if (!day) return null
  return { start: day.getTime(), end: addDays(day, 1).getTime() }
}

/**
 * Entries overlapping a local day, each clipped to it.
 *
 * Entries may cross midnight — unlike TimelineEntry, which is one-off *per
 * day* by construction. They are deliberately **not** split at write time
 * (that would be the app silently editing the user's record); they're clipped
 * at read. Note this differs from the old model, where a session belonged
 * wholly to the day it started on, so a 23:50→00:20 block counted entirely to
 * the first day.
 */
export function entriesOverlappingDay(entries: TimeEntry[], date: string, now: Date): TimeEntry[] {
  const bounds = dayBounds(date)
  if (!bounds) return []
  return entries
    .filter((entry) => Date.parse(entry.startedAt) < bounds.end && entryEndMs(entry, now) > bounds.start)
    .map((entry) => clipToDay(entry, date, now) ?? entry)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** One entry clipped to a local day, or null if it doesn't overlap. Keeps the
 * entry's id so callers can still address the underlying record. */
export function clipToDay(entry: TimeEntry, date: string, now: Date): TimeEntry | null {
  const bounds = dayBounds(date)
  if (!bounds) return null
  const startMs = Math.max(Date.parse(entry.startedAt), bounds.start)
  const endMs = Math.min(entryEndMs(entry, now), bounds.end)
  if (endMs <= startMs) return null
  return {
    ...entry,
    startedAt: new Date(startMs).toISOString(),
    // An open entry stays open only if the clip didn't move its end.
    endedAt: entry.endedAt === null && endMs === entryEndMs(entry, now) ? null : new Date(endMs).toISOString(),
  }
}

/**
 * Pairs of entry ids whose intervals overlap. Live tracking cannot produce
 * one (startTracking closes before it opens), so anything found here came
 * from hand-editing. Surfaced as a warning rather than auto-clamped —
 * silently moving a neighbour the user didn't touch is worse than telling
 * them.
 */
export function findOverlaps(entries: TimeEntry[], now: Date): [string, string][] {
  const sorted = [...entries].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  const overlaps: [string, string][] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const endMs = entryEndMs(sorted[i], now)
    for (let j = i + 1; j < sorted.length; j++) {
      if (Date.parse(sorted[j].startedAt) >= endMs) break
      overlaps.push([sorted[i].id, sorted[j].id])
    }
  }
  return overlaps
}

/** Local "YYYY-MM-DD" an entry starts on — the bucket for day grouping. */
export function entryStartDate(entry: TimeEntry): string {
  return toDateOnlyString(new Date(entry.startedAt))
}
