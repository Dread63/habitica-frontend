import type { TimelineEntry } from '@/features/timeline/timelineEntries'
import type { PomodoroPhaseRecord } from '@/features/pomodoro/pomodoroPhases'
import type { TimeEntry, TimeEntryState } from '@/features/tracking/timeEntries'

/**
 * Reconciling this device's copy with the server's.
 *
 * The rules are deliberately the *same* on both sides — the server enforces
 * them in SQL (`WHERE updated_at <= excluded.updated_at`) and this enforces
 * them in TypeScript — so it doesn't matter whether a record travels
 * client→server or server→client. That symmetry is what makes a sync safe to
 * retry, run twice, or interrupt halfway.
 *
 * Three different rules, because the three kinds of data have genuinely
 * different semantics:
 *
 *  - **Timeline placements** are mutable, so they're last-write-wins on
 *    `updatedAt`, with deletions represented as tombstones. A tombstone
 *    competes on timestamp like any other write, which is what stops a device
 *    that was offline during a delete from resurrecting the block.
 *  - **Time entries** are mutable — you can correct one you forgot to
 *    switch — so they merge exactly like timeline placements: last-write-wins
 *    with tombstones. `INSERT OR IGNORE` would silently drop a corrected end
 *    time and leave two devices permanently divergent with no error anywhere.
 *  - **Pomodoro phases** are immutable history, so they're a plain union by
 *    id. Nothing is ever overwritten — the timer having run for 25 minutes is
 *    a fact about a machine, and this is the record that earns append-only
 *    storage (the old focus_sessions table claimed it without deserving it).
 *  - **Settings** are a single record, last-write-wins.
 *
 * Applying the merge locally as well as remotely also closes a small race:
 * an edit made while a sync request is in flight would otherwise be
 * overwritten by the response it wasn't included in.
 */

export interface RemoteTimelineEntry {
  id: string
  updatedAt: number
  deleted: boolean
  payload: TimelineEntry | null
}

export interface RemoteTimeEntry {
  id: string
  updatedAt: number
  deleted: boolean
  /** Denormalised so the server can range-scan exports without parsing the
   * payload; null on a tombstone. */
  startedAt: string | null
  payload: TimeEntry | null
}

export interface RemotePomodoroPhase {
  id: string
  startedAt: string
  payload: PomodoroPhaseRecord
}

export interface RemoteSettings<T> {
  updatedAt: number
  payload: T
}

export interface LocalTimelineState {
  entries: TimelineEntry[]
  tombstones: Record<string, number>
}

/** The minimum a record must carry to take part in versioned merging. */
export interface Versioned {
  id: string
  updatedAt: number
}

export interface VersionedState<T extends Versioned> {
  records: T[]
  tombstones: Record<string, number>
}

export interface RemoteVersioned<T> {
  id: string
  updatedAt: number
  deleted: boolean
  payload: T | null
}

/**
 * Merge one id's worth of history, for any record type that carries an
 * `updatedAt`. Whichever side has the newer timestamp wins, and a tie
 * resolves to *deleted* — deliberately: if a delete and an edit land on the
 * same millisecond, honouring the delete is recoverable (re-create the
 * record) while wrongly keeping it is not obviously wrong to the user and
 * silently diverges the two devices.
 *
 * This is generic rather than duplicated per record type on purpose. The
 * tie-break above and the "a tombstone competes on timestamp like any other
 * write" rule are the subtlest logic in the app, and a second copy would
 * inevitably drift from this one. Callers supply only the final sort, which
 * is the one thing that legitimately differs between record types.
 */
export function mergeVersioned<T extends Versioned>(
  local: VersionedState<T>,
  remote: RemoteVersioned<T>[],
  compare: (a: T, b: T) => number,
): VersionedState<T> {
  const liveById = new Map(local.records.map((r) => [r.id, r]))
  const tombstones = { ...local.tombstones }

  for (const incoming of remote) {
    const localLive = liveById.get(incoming.id)
    const localDeletedAt = tombstones[incoming.id]
    const localStamp = Math.max(localLive?.updatedAt ?? -1, localDeletedAt ?? -1)

    // Local is strictly newer — keep it, and let the next push carry it up.
    if (localStamp > incoming.updatedAt) continue

    if (incoming.deleted) {
      liveById.delete(incoming.id)
      tombstones[incoming.id] = incoming.updatedAt
    } else if (incoming.payload) {
      // A tie with a local tombstone keeps the deletion (see above).
      if (localDeletedAt !== undefined && localDeletedAt >= incoming.updatedAt) continue
      liveById.set(incoming.id, { ...incoming.payload, updatedAt: incoming.updatedAt })
      delete tombstones[incoming.id]
    }
  }

  return { records: [...liveById.values()].sort(compare), tombstones }
}

/**
 * Timeline placements. Sorted by `createdAt` — the original stable ordering
 * convention (entriesForDate sorts by start time, then this) so a sync never
 * reshuffles the day.
 */
export function mergeTimeline(local: LocalTimelineState, remote: RemoteTimelineEntry[]): LocalTimelineState {
  const merged = mergeVersioned<TimelineEntry>(
    { records: local.entries, tombstones: local.tombstones },
    remote,
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  )
  return { entries: merged.records, tombstones: merged.tombstones }
}

/**
 * Time entries. Sorted by `startedAt` — the ledger reads chronologically,
 * unlike timeline placements which keep creation order.
 */
export function mergeTimeEntries(local: TimeEntryState, remote: RemoteTimeEntry[]): TimeEntryState {
  const merged = mergeVersioned<TimeEntry>(
    { records: local.entries, tombstones: local.tombstones },
    remote,
    (a, b) => a.startedAt.localeCompare(b.startedAt),
  )
  return { entries: merged.records, tombstones: merged.tombstones }
}

/** Union by id, oldest first. Local wins a collision only because nothing
 * ever legitimately differs — ids are uuids and phase records are immutable. */
export function mergePhases(
  local: PomodoroPhaseRecord[],
  remote: RemotePomodoroPhase[],
): PomodoroPhaseRecord[] {
  const byId = new Map<string, PomodoroPhaseRecord>()
  for (const phase of remote) byId.set(phase.id, phase.payload)
  for (const phase of local) byId.set(phase.id, phase)
  return [...byId.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

export function mergeSettings<T>(
  local: RemoteSettings<T> | null,
  remote: RemoteSettings<T> | null,
): RemoteSettings<T> | null {
  if (!remote) return local
  if (!local) return remote
  return remote.updatedAt > local.updatedAt ? remote : local
}

/**
 * What this device pushes: everything it holds, including its tombstones.
 *
 * **The open time entry is deliberately excluded.** A foreign open entry
 * landing on a second device would show "working on X" for something started
 * on another machine, and would break that device's own one-open-entry
 * invariant on merge with no clean way to unwind. This mirrors the existing,
 * correct decision that `run` is device-local — a live clock belongs to the
 * machine it was started on. The cost is that an in-progress entry is
 * invisible on your phone until it closes; accepted.
 */
export function buildPushPayload<T>(params: {
  timeline: LocalTimelineState
  timeEntries: TimeEntryState
  phases: PomodoroPhaseRecord[]
  settings: RemoteSettings<T> | null
}) {
  const { timeline, timeEntries, phases, settings } = params
  return {
    timelineEntries: [
      ...timeline.entries.map((entry) => ({
        id: entry.id,
        updatedAt: entry.updatedAt,
        deleted: false,
        payload: entry,
      })),
      ...Object.entries(timeline.tombstones).map(([id, updatedAt]) => ({
        id,
        updatedAt,
        deleted: true,
        payload: null,
      })),
    ],
    timeEntries: [
      ...timeEntries.entries
        .filter((entry) => entry.endedAt !== null)
        .map((entry) => ({
          id: entry.id,
          updatedAt: entry.updatedAt,
          deleted: false,
          startedAt: entry.startedAt,
          payload: entry,
        })),
      ...Object.entries(timeEntries.tombstones).map(([id, updatedAt]) => ({
        id,
        updatedAt,
        deleted: true,
        startedAt: null,
        payload: null,
      })),
    ],
    phases: phases.map((phase) => ({ id: phase.id, startedAt: phase.startedAt, payload: phase })),
    settings,
  }
}
