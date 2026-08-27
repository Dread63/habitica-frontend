// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applySync,
  openDatabase,
  insertSession,
  readSessions,
  readSettings,
  readTimelineEntries,
  upsertSettings,
  upsertTimelineEntry,
} from './store.js'

let db

beforeEach(() => {
  db = openDatabase(':memory:')
})

const USER = 'user-abc123'
const OTHER = 'user-xyz789'

const entry = (id, updatedAt, extra = {}) => ({
  id,
  updatedAt,
  payload: { id, startMinutes: 540 },
  ...extra,
})

describe('timeline entries — last write wins', () => {
  it('stores and returns a payload', () => {
    upsertTimelineEntry(db, USER, entry('e1', 1000))
    expect(readTimelineEntries(db, USER)).toEqual([
      { id: 'e1', updatedAt: 1000, deleted: false, payload: { id: 'e1', startMinutes: 540 } },
    ])
  })

  it('a newer write wins', () => {
    upsertTimelineEntry(db, USER, entry('e1', 1000))
    upsertTimelineEntry(db, USER, { id: 'e1', updatedAt: 2000, payload: { id: 'e1', startMinutes: 600 } })
    expect(readTimelineEntries(db, USER)[0].payload.startMinutes).toBe(600)
  })

  it('an older write from a stale device is ignored, not applied', () => {
    upsertTimelineEntry(db, USER, entry('e1', 2000))
    upsertTimelineEntry(db, USER, { id: 'e1', updatedAt: 1000, payload: { id: 'e1', startMinutes: 999 } })
    expect(readTimelineEntries(db, USER)[0].payload.startMinutes).toBe(540)
  })

  it('replaying the same write is a no-op rather than a flip-flop', () => {
    upsertTimelineEntry(db, USER, entry('e1', 1000))
    upsertTimelineEntry(db, USER, entry('e1', 1000))
    expect(readTimelineEntries(db, USER)).toHaveLength(1)
  })

  it('deletes are tombstones, so an offline device cannot resurrect them', () => {
    upsertTimelineEntry(db, USER, entry('e1', 1000))
    upsertTimelineEntry(db, USER, { id: 'e1', updatedAt: 2000, deleted: true })

    const [row] = readTimelineEntries(db, USER)
    expect(row).toEqual({ id: 'e1', updatedAt: 2000, deleted: true, payload: null })

    // The stale device pushes its pre-delete copy back.
    upsertTimelineEntry(db, USER, entry('e1', 1500))
    expect(readTimelineEntries(db, USER)[0].deleted).toBe(true)
  })

  it('partitions data per user', () => {
    upsertTimelineEntry(db, USER, entry('e1', 1000))
    upsertTimelineEntry(db, OTHER, entry('e1', 1000))
    expect(readTimelineEntries(db, USER)).toHaveLength(1)
    expect(readTimelineEntries(db, OTHER)).toHaveLength(1)
  })
})

describe('focus sessions — append only', () => {
  const session = (id, startedAt, minutes) => ({
    id,
    startedAt,
    payload: { id, startedAt, durationMinutes: minutes },
  })

  it('never overwrites an existing session', () => {
    // The audit trail's core property: a recorded session is a fact about the
    // past, so a later push claiming otherwise must not rewrite it.
    insertSession(db, USER, session('s1', '2026-08-25T09:00:00.000Z', 25))
    insertSession(db, USER, session('s1', '2026-08-25T09:00:00.000Z', 999))
    expect(readSessions(db, USER)[0].payload.durationMinutes).toBe(25)
  })

  it('returns sessions in chronological order regardless of insert order', () => {
    insertSession(db, USER, session('later', '2026-08-25T14:00:00.000Z', 25))
    insertSession(db, USER, session('earlier', '2026-08-25T09:00:00.000Z', 25))
    expect(readSessions(db, USER).map((s) => s.id)).toEqual(['earlier', 'later'])
  })

  it('filters by date range for scoped exports', () => {
    insertSession(db, USER, session('a', '2026-08-24T09:00:00.000Z', 25))
    insertSession(db, USER, session('b', '2026-08-25T09:00:00.000Z', 25))
    insertSession(db, USER, session('c', '2026-08-26T09:00:00.000Z', 25))
    const scoped = readSessions(db, USER, { from: '2026-08-25', to: '2026-08-25T23:59:59Z' })
    expect(scoped.map((s) => s.id)).toEqual(['b'])
  })
})

describe('settings', () => {
  it('last write wins and older writes are ignored', () => {
    upsertSettings(db, USER, { updatedAt: 1000, payload: { workMinutes: 25 } })
    upsertSettings(db, USER, { updatedAt: 2000, payload: { workMinutes: 50 } })
    expect(readSettings(db, USER).payload.workMinutes).toBe(50)
    upsertSettings(db, USER, { updatedAt: 1500, payload: { workMinutes: 5 } })
    expect(readSettings(db, USER).payload.workMinutes).toBe(50)
  })

  it('is null for a user with nothing stored', () => {
    expect(readSettings(db, USER)).toBeNull()
  })
})

describe('applySync', () => {
  it('applies entries, sessions and settings together', () => {
    applySync(db, USER, {
      timelineEntries: [entry('e1', 1000), entry('e2', 1000)],
      sessions: [{ id: 's1', startedAt: '2026-08-25T09:00:00.000Z', payload: { id: 's1' } }],
      settings: { updatedAt: 1000, payload: { trackedTagIds: ['t1'] } },
    })
    expect(readTimelineEntries(db, USER)).toHaveLength(2)
    expect(readSessions(db, USER)).toHaveLength(1)
    expect(readSettings(db, USER).payload.trackedTagIds).toEqual(['t1'])
  })

  it('tolerates a push with nothing in it', () => {
    applySync(db, USER, {})
    expect(readTimelineEntries(db, USER)).toEqual([])
  })

  it('rolls back entirely if one record is malformed', () => {
    applySync(db, USER, { timelineEntries: [entry('good', 1000)] })
    expect(() =>
      applySync(db, USER, {
        timelineEntries: [entry('e2', 2000), { id: null, updatedAt: 2000 }],
      }),
    ).toThrow()
    // e2 must not have landed — a half-applied sync is worse than a failed one.
    expect(readTimelineEntries(db, USER).map((e) => e.id)).toEqual(['good'])
  })
})
