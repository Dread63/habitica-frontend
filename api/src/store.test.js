// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applySync,
  openDatabase,
  insertPhase,
  readPhases,
  readSettings,
  readTimeEntries,
  readTimeEntriesInRange,
  readTimelineEntries,
  upsertSettings,
  upsertTimeEntry,
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

const timeEntry = (id, updatedAt, extra = {}) => ({
  id,
  updatedAt,
  startedAt: '2026-08-27T09:00:00.000Z',
  payload: { id, startedAt: '2026-08-27T09:00:00.000Z', endedAt: '2026-08-27T09:25:00.000Z' },
  ...extra,
})

describe('time entries — mutable, last write wins', () => {
  it('an edited entry replaces the original', () => {
    // The reason this table is NOT append-only: entries are correctable, and
    // INSERT OR IGNORE would silently drop the correction.
    upsertTimeEntry(db, USER, timeEntry('e1', 1000))
    upsertTimeEntry(db, USER, {
      id: 'e1',
      updatedAt: 2000,
      startedAt: '2026-08-27T09:00:00.000Z',
      payload: { id: 'e1', endedAt: '2026-08-27T09:40:00.000Z' },
    })
    expect(readTimeEntries(db, USER)[0].payload.endedAt).toBe('2026-08-27T09:40:00.000Z')
  })

  it('an older write from a stale device is ignored', () => {
    upsertTimeEntry(db, USER, timeEntry('e1', 2000))
    upsertTimeEntry(db, USER, { id: 'e1', updatedAt: 1000, startedAt: 'x', payload: { id: 'e1', wrong: true } })
    expect(readTimeEntries(db, USER)[0].payload.wrong).toBeUndefined()
  })

  it('deletes are tombstones that survive a stale push', () => {
    upsertTimeEntry(db, USER, timeEntry('e1', 1000))
    upsertTimeEntry(db, USER, { id: 'e1', updatedAt: 2000, deleted: true })
    expect(readTimeEntries(db, USER)[0]).toMatchObject({ deleted: true, payload: null })

    upsertTimeEntry(db, USER, timeEntry('e1', 1500))
    expect(readTimeEntries(db, USER)[0].deleted).toBe(true)
  })

  it('range reads exclude tombstones and honour from/to', () => {
    upsertTimeEntry(db, USER, { ...timeEntry('a', 1), startedAt: '2026-08-26T09:00:00.000Z' })
    upsertTimeEntry(db, USER, { ...timeEntry('b', 1), startedAt: '2026-08-27T09:00:00.000Z' })
    upsertTimeEntry(db, USER, { id: 'c', updatedAt: 1, deleted: true })
    const scoped = readTimeEntriesInRange(db, USER, { from: '2026-08-27', to: '2026-08-27T23:59:59Z' })
    expect(scoped.map((e) => e.id)).toEqual(['b'])
  })

  it('partitions data per user', () => {
    upsertTimeEntry(db, USER, timeEntry('e1', 1000))
    upsertTimeEntry(db, OTHER, timeEntry('e1', 1000))
    expect(readTimeEntries(db, USER)).toHaveLength(1)
    expect(readTimeEntries(db, OTHER)).toHaveLength(1)
  })
})

describe('pomodoro phases — append only', () => {
  const phase = (id, startedAt, plannedMs) => ({
    id,
    startedAt,
    payload: { id, startedAt, plannedMs },
  })

  it('never overwrites an existing phase — the timer having run is a fact', () => {
    insertPhase(db, USER, phase('p1', '2026-08-27T09:00:00.000Z', 1500000))
    insertPhase(db, USER, phase('p1', '2026-08-27T09:00:00.000Z', 999))
    expect(readPhases(db, USER)[0].payload.plannedMs).toBe(1500000)
  })

  it('returns phases chronologically regardless of insert order', () => {
    insertPhase(db, USER, phase('later', '2026-08-27T14:00:00.000Z', 1))
    insertPhase(db, USER, phase('earlier', '2026-08-27T09:00:00.000Z', 1))
    expect(readPhases(db, USER).map((p) => p.id)).toEqual(['earlier', 'later'])
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
  it('applies placements, time entries, phases and settings together', () => {
    applySync(db, USER, {
      timelineEntries: [entry('e1', 1000), entry('e2', 1000)],
      timeEntries: [timeEntry('t1', 1000)],
      phases: [{ id: 'p1', startedAt: '2026-08-27T09:00:00.000Z', payload: { id: 'p1' } }],
      settings: { updatedAt: 1000, payload: { trackedTagIds: ['t1'] } },
    })
    expect(readTimelineEntries(db, USER)).toHaveLength(2)
    expect(readTimeEntries(db, USER)).toHaveLength(1)
    expect(readPhases(db, USER)).toHaveLength(1)
    expect(readSettings(db, USER).payload.trackedTagIds).toEqual(['t1'])
  })

  it('tolerates a legacy body containing a `sessions` key', () => {
    // The rolling-deploy guard: the api can be updated before a browser
    // reloads, and the stale bundle still pushes the old shape. Ignoring it
    // is what keeps that from 500ing.
    expect(() =>
      applySync(db, USER, { sessions: [{ id: 'old', startedAt: 'x', payload: {} }], timeEntries: [timeEntry('n', 1)] }),
    ).not.toThrow()
    expect(readTimeEntries(db, USER).map((e) => e.id)).toEqual(['n'])
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
