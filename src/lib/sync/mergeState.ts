import type { TimelineEntry } from '@/features/timeline/timelineEntries'
import type { PomodoroSessionRecord } from '@/features/pomodoro/pomodoroStats'

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
 *  - **Focus sessions** are immutable history, so they're a plain union by
 *    id. Nothing is ever overwritten — a session that happened is a fact, and
 *    the log's value as evidence depends on it staying one.
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

export interface RemoteSession {
  id: string
  startedAt: string
  payload: PomodoroSessionRecord
}

export interface RemoteSettings<T> {
  updatedAt: number
  payload: T
}

export interface LocalTimelineState {
  entries: TimelineEntry[]
  tombstones: Record<string, number>
}

/**
 * Merge one id's worth of history. Whichever side has the newer timestamp
 * wins, and a tie resolves to *deleted* — deliberately: if a delete and an
 * edit land on the same millisecond, honouring the delete is recoverable
 * (re-create the block) while wrongly keeping it is not obviously wrong to
 * the user and silently diverges the two devices.
 */
export function mergeTimeline(local: LocalTimelineState, remote: RemoteTimelineEntry[]): LocalTimelineState {
  const liveById = new Map(local.entries.map((e) => [e.id, e]))
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

  return {
    // createdAt keeps the original stable ordering convention (entriesForDate
    // sorts by start time, then this) so a sync never reshuffles the day.
    entries: [...liveById.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    tombstones,
  }
}

/** Union by id, oldest first. Local wins a collision only because nothing
 * ever legitimately differs — ids are uuids and records are immutable. */
export function mergeSessions(
  local: PomodoroSessionRecord[],
  remote: RemoteSession[],
): PomodoroSessionRecord[] {
  const byId = new Map<string, PomodoroSessionRecord>()
  for (const session of remote) byId.set(session.id, session.payload)
  for (const session of local) byId.set(session.id, session)
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

/** What this device pushes: everything it holds, including its tombstones. */
export function buildPushPayload<T>(params: {
  timeline: LocalTimelineState
  sessions: PomodoroSessionRecord[]
  settings: RemoteSettings<T> | null
}) {
  const { timeline, sessions, settings } = params
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
    sessions: sessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt,
      payload: session,
    })),
    settings,
  }
}
