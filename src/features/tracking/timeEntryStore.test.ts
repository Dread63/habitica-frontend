import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entryDurationMs, isOpen, openEntryOf, type TimeEntry, type TimeEntryTaskRef } from './timeEntries'
import { migrateTimeEntryState, useTimeEntryStore } from './timeEntryStore'

const at = (h: number, m = 0) => new Date(2026, 7, 27, h, m, 0, 0)
const task = (id: string): TimeEntryTaskRef => ({ id, text: `Task ${id}`, type: 'todo', tagIds: [] })
const store = () => useTimeEntryStore.getState()

beforeEach(() => {
  vi.useFakeTimers()
  useTimeEntryStore.setState({ entries: [], tombstones: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the store drives the pointer', () => {
  it('start/switch/stop produces a contiguous log', () => {
    vi.setSystemTime(at(9))
    store().start(task('a'))
    vi.setSystemTime(at(9, 10))
    store().start(task('b'))
    vi.setSystemTime(at(9, 25))
    store().stop()

    const { entries } = store()
    expect(entries.map((e) => [e.taskId, Math.round(entryDurationMs(e, at(9, 25)) / 60_000)])).toEqual([
      ['a', 10],
      ['b', 15],
    ])
    expect(openEntryOf(entries)).toBeUndefined()
  })

  it('stopAt closes at a past instant, not now', () => {
    // A phase end detected hours late must close at the phase's real end.
    vi.setSystemTime(at(9))
    store().start(task('a'), { source: 'pomodoro', phaseId: 'p1' })
    vi.setSystemTime(at(14))
    store().stopAt(at(9, 25), 'phase')
    expect(store().entries[0].endedAt).toBe(at(9, 25).toISOString())
    expect(entryDurationMs(store().entries[0], at(14))).toBe(25 * 60_000)
  })

  it('deleting the tracked task stops the pointer and keeps the record', () => {
    vi.setSystemTime(at(9))
    store().start(task('a'))
    vi.setSystemTime(at(9, 20))
    store().onTaskDeleted('a')

    expect(store().entries).toHaveLength(1)
    expect(openEntryOf(store().entries)).toBeUndefined()
    expect(entryDurationMs(store().entries[0], at(9, 20))).toBe(20 * 60_000)
  })

  it('removing an entry leaves a tombstone so sync cannot resurrect it', () => {
    vi.setSystemTime(at(9))
    store().start(task('a'))
    vi.setSystemTime(at(9, 25))
    store().stop()
    const id = store().entries[0].id

    store().remove(id)
    expect(store().entries).toEqual([])
    expect(store().tombstones[id]).toBe(at(9, 25).getTime())
  })

  it('applySyncedState normalises a foreign state with two open entries', () => {
    const open = (id: string, hour: number): TimeEntry => ({
      id,
      taskId: id,
      startedAt: at(hour).toISOString(),
      endedAt: null,
      taskSnapshot: { text: id, type: 'todo', tagIds: [] },
      source: 'manual',
      createdAt: at(hour).toISOString(),
      updatedAt: at(hour).getTime(),
    })
    vi.setSystemTime(at(11))
    store().applySyncedState({ entries: [open('a', 9), open('b', 10)], tombstones: {} })
    expect(store().entries.filter(isOpen)).toHaveLength(1)
  })
})

describe('migrateTimeEntryState', () => {
  it('returns an empty state for a missing or unrecognisable payload', () => {
    expect(migrateTimeEntryState(undefined, 0, at(9))).toEqual({ entries: [], tombstones: {} })
    expect(migrateTimeEntryState({ entries: 'nonsense' }, 0, at(9))).toEqual({ entries: [], tombstones: {} })
  })

  it('preserves entries and tombstones', () => {
    const entry: TimeEntry = {
      id: 'e1',
      taskId: 'a',
      startedAt: at(9).toISOString(),
      endedAt: at(9, 25).toISOString(),
      taskSnapshot: { text: 'a', type: 'todo', tagIds: [] },
      source: 'manual',
      createdAt: at(9).toISOString(),
      updatedAt: at(9).getTime(),
    }
    const result = migrateTimeEntryState({ entries: [entry], tombstones: { gone: 5 } }, 1, at(10))
    expect(result.entries).toEqual([entry])
    expect(result.tombstones).toEqual({ gone: 5 })
  })

  it('closes a stray open entry rather than loading two', () => {
    const open = (id: string, hour: number): TimeEntry => ({
      id,
      taskId: id,
      startedAt: at(hour).toISOString(),
      endedAt: null,
      taskSnapshot: { text: id, type: 'todo', tagIds: [] },
      source: 'manual',
      createdAt: at(hour).toISOString(),
      updatedAt: at(hour).getTime(),
    })
    const result = migrateTimeEntryState({ entries: [open('a', 9), open('b', 10)], tombstones: {} }, 1, at(11))
    expect(result.entries.filter(isOpen)).toHaveLength(1)
  })
})
