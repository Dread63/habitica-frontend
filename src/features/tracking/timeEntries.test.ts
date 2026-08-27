import { describe, expect, it } from 'vitest'
import {
  clipToDay,
  closeStrayOpenEntries,
  deleteEntry,
  editEntry,
  entriesOverlappingDay,
  entryDurationMs,
  findOverlaps,
  handleTaskDeleted,
  isOpen,
  MIN_ENTRY_MS,
  openEntryOf,
  splitEntry,
  startTracking,
  stopTracking,
  totalDurationMs,
  wasEdited,
  type TimeEntryState,
  type TimeEntryTaskRef,
} from './timeEntries'

/** Local wall-clock on 2026-08-27, so day-bucketing assertions hold anywhere. */
const at = (h: number, m = 0, s = 0) => new Date(2026, 7, 27, h, m, s, 0)
const DATE = '2026-08-27'

const task = (id: string, tagIds: string[] = []): TimeEntryTaskRef => ({
  id,
  text: `Task ${id}`,
  type: 'todo',
  tagIds,
})

const EMPTY: TimeEntryState = { entries: [], tombstones: {} }

/** [taskId, durationMinutes] for each closed entry, in order. */
function log(state: TimeEntryState, now: Date): [string, number][] {
  return state.entries.map((e) => [e.taskId, Math.round(entryDurationMs(e, now) / 60_000)])
}

describe('startTracking', () => {
  it('opens an interval with no end', () => {
    const state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    expect(state.entries).toHaveLength(1)
    expect(isOpen(state.entries[0])).toBe(true)
    expect(openEntryOf(state.entries)?.taskId).toBe('a')
  })

  it('closes the previous interval at exactly the switch instant — no gap, no overlap', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = startTracking(state, { task: task('b'), source: 'manual' }, at(9, 10), 'e2')

    const [first, second] = state.entries
    expect(first.endedAt).toBe(at(9, 10).toISOString())
    expect(second.startedAt).toBe(at(9, 10).toISOString())
    expect(first.closedBy).toBe('switch')
    expect(findOverlaps(state.entries, at(9, 25))).toEqual([])
  })

  it('is idempotent — reopening the same task in the same phase returns the same state', () => {
    // PomodoroPanel is mounted twice and StrictMode double-invokes effects; a
    // naive implementation would litter the ledger with duplicate intervals.
    const state = startTracking(EMPTY, { task: task('a'), source: 'pomodoro', phaseId: 'p1' }, at(9), 'e1')
    const again = startTracking(state, { task: task('a'), source: 'pomodoro', phaseId: 'p1' }, at(9, 0, 1), 'e2')
    expect(again).toBe(state)
  })

  it('a new phase on the same task is a new interval, not a no-op', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'pomodoro', phaseId: 'p1' }, at(9), 'e1')
    state = startTracking(state, { task: task('a'), source: 'pomodoro', phaseId: 'p2' }, at(9, 30), 'e2')
    expect(state.entries).toHaveLength(2)
  })

  it('freezes the task snapshot at open', () => {
    const state = startTracking(EMPTY, { task: task('a', ['tag-work']), source: 'manual' }, at(9), 'e1')
    expect(state.entries[0].taskSnapshot).toEqual({ text: 'Task a', type: 'todo', tagIds: ['tag-work'] })
  })
})

describe('stopTracking', () => {
  it('closes the open entry and records why', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 25), 'user')
    expect(state.entries[0].endedAt).toBe(at(9, 25).toISOString())
    expect(state.entries[0].closedBy).toBe('user')
    expect(openEntryOf(state.entries)).toBeUndefined()
  })

  it('drops an interval shorter than the minimum rather than recording a misclick', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, new Date(at(9).getTime() + MIN_ENTRY_MS - 1), 'user')
    expect(state.entries).toEqual([])
  })

  it('keeps a deliberate short interval — 40 seconds is real time', () => {
    // The old model discarded anything under a minute. That is wrong for a
    // tracker: a considered 40-second entry is not noise.
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 0, 40), 'user')
    expect(state.entries).toHaveLength(1)
  })

  it('is a no-op when nothing is open', () => {
    expect(stopTracking(EMPTY, at(9), 'user')).toBe(EMPTY)
  })
})

describe('the recorded log is immune to later edits — the point of the rework', () => {
  it('switching at minute 24 gives the first task 24 minutes and the second the rest', () => {
    // Previously a task linked at minute 24 retroactively claimed an even
    // share of the whole phase.
    let state = startTracking(EMPTY, { task: task('essay'), source: 'manual' }, at(9), 'e1')
    state = startTracking(state, { task: task('report'), source: 'manual' }, at(9, 24), 'e2')
    state = stopTracking(state, at(9, 30), 'user')
    expect(log(state, at(9, 30))).toEqual([
      ['essay', 24],
      ['report', 6],
    ])
  })

  it('stopping a task at minute 24 keeps the 24 minutes it was attached', () => {
    // Previously removing a chip gave it zero for the whole phase.
    let state = startTracking(EMPTY, { task: task('essay'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 24), 'user')
    expect(log(state, at(9, 30))).toEqual([['essay', 24]])
  })

  it('every recorded minute has exactly one owner', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = startTracking(state, { task: task('b'), source: 'manual' }, at(9, 10), 'e2')
    state = startTracking(state, { task: task('c'), source: 'manual' }, at(9, 15), 'e3')
    state = stopTracking(state, at(9, 30), 'user')

    expect(totalDurationMs(state.entries, at(9, 30))).toBe(30 * 60_000)
    expect(findOverlaps(state.entries, at(9, 30))).toEqual([])
  })
})

describe('closeStrayOpenEntries', () => {
  it('leaves a well-formed state alone', () => {
    const state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    expect(closeStrayOpenEntries(state, at(10))).toBe(state)
  })

  it('closes all but the newest open entry at its successor start', () => {
    // Only reachable via foreign state — a bad merge or a hand-edited store.
    const corrupt: TimeEntryState = {
      entries: [
        { ...startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1').entries[0] },
        { ...startTracking(EMPTY, { task: task('b'), source: 'manual' }, at(9, 20), 'e2').entries[0] },
      ],
      tombstones: {},
    }
    const fixed = closeStrayOpenEntries(corrupt, at(10))
    expect(fixed.entries.filter(isOpen)).toHaveLength(1)
    expect(fixed.entries[0].endedAt).toBe(at(9, 20).toISOString())
    expect(fixed.entries[0].closedBy).toBe('reconciled')
    // No duration invented out of nothing.
    expect(totalDurationMs(fixed.entries, at(10))).toBe(60 * 60_000)
  })
})

describe('editEntry', () => {
  it('captures the original on the first edit and never overwrites it', () => {
    // The property the export's credibility rests on.
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 25), 'user')

    state = editEntry(state, 'e1', { endedAt: at(9, 40).toISOString() }, at(10))
    const afterFirst = state.entries[0].audit
    expect(afterFirst?.original.endedAt).toBe(at(9, 25).toISOString())
    expect(afterFirst?.editCount).toBe(1)

    state = editEntry(state, 'e1', { endedAt: at(9, 50).toISOString() }, at(11))
    expect(state.entries[0].audit?.original.endedAt).toBe(at(9, 25).toISOString())
    expect(state.entries[0].audit?.editCount).toBe(2)
    expect(wasEdited(state.entries[0])).toBe(true)
  })

  it('can reassign the task, keeping the original task id in the audit', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 25), 'user')
    state = editEntry(state, 'e1', { taskId: 'b' }, at(10))
    expect(state.entries[0].taskId).toBe('b')
    expect(state.entries[0].audit?.original.taskId).toBe('a')
  })
})

describe('splitEntry', () => {
  it('conserves total duration and leaves no gap', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 30), 'user')
    state = splitEntry(state, 'e1', at(9, 10), at(10), 'e2')

    expect(state.entries).toHaveLength(2)
    expect(state.entries[0].endedAt).toBe(at(9, 10).toISOString())
    expect(state.entries[1].startedAt).toBe(at(9, 10).toISOString())
    expect(state.entries[1].splitFromId).toBe('e1')
    expect(totalDurationMs(state.entries, at(10))).toBe(30 * 60_000)
    expect(findOverlaps(state.entries, at(10))).toEqual([])
  })

  it('refuses a split that would create a degenerate half', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 30), 'user')
    expect(splitEntry(state, 'e1', at(9, 0, 1), at(10), 'e2')).toBe(state)
    expect(splitEntry(state, 'e1', at(9, 29, 59), at(10), 'e2')).toBe(state)
  })

  it('is not marked as edited — nothing was misstated, only subdivided', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 30), 'user')
    state = splitEntry(state, 'e1', at(9, 10), at(10), 'e2')
    expect(state.entries.some(wasEdited)).toBe(false)
  })
})

describe('deleteEntry', () => {
  it('tombstones rather than merely removing', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 25), 'user')
    state = deleteEntry(state, 'e1', at(10))
    expect(state.entries).toEqual([])
    expect(state.tombstones.e1).toBe(at(10).getTime())
  })
})

describe('handleTaskDeleted', () => {
  it('stops the pointer but KEEPS the history — deliberately not a cascade', () => {
    // Opposite to timelineEntryStore.pruneTask. Deleting a task must not erase
    // the record of time spent on it.
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = startTracking(state, { task: task('b'), source: 'manual' }, at(9, 10), 'e2')
    state = handleTaskDeleted(state, 'b', at(9, 20))

    expect(state.entries).toHaveLength(2)
    expect(openEntryOf(state.entries)).toBeUndefined()
    expect(log(state, at(9, 20))).toEqual([
      ['a', 10],
      ['b', 10],
    ])
  })

  it('ignores a deletion of a task that is not being tracked', () => {
    const state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    expect(handleTaskDeleted(state, 'other', at(9, 20))).toBe(state)
  })
})

describe('days and midnight', () => {
  const crossMidnight = (): TimeEntryState => ({
    entries: [
      {
        id: 'e1',
        taskId: 'a',
        startedAt: new Date(2026, 7, 27, 23, 50).toISOString(),
        endedAt: new Date(2026, 7, 28, 0, 20).toISOString(),
        taskSnapshot: { text: 'Task a', type: 'todo', tagIds: [] },
        source: 'manual',
        createdAt: '2026-08-27T00:00:00.000Z',
        updatedAt: 0,
      },
    ],
    tombstones: {},
  })

  it('clips an entry to each day it touches, and the halves sum to the whole', () => {
    // Differs from the old model, where a session belonged wholly to its
    // start day.
    const state = crossMidnight()
    const now = new Date(2026, 7, 28, 9)
    const first = entriesOverlappingDay(state.entries, '2026-08-27', now)
    const second = entriesOverlappingDay(state.entries, '2026-08-28', now)

    expect(entryDurationMs(first[0], now)).toBe(10 * 60_000)
    expect(entryDurationMs(second[0], now)).toBe(20 * 60_000)
    expect(entryDurationMs(first[0], now) + entryDurationMs(second[0], now)).toBe(30 * 60_000)
  })

  it('returns nothing for a day the entry does not touch', () => {
    expect(entriesOverlappingDay(crossMidnight().entries, '2026-08-25', at(9))).toEqual([])
    expect(clipToDay(crossMidnight().entries[0], '2026-08-25', at(9))).toBeNull()
  })

  it('an open entry stays open when the clip does not move its end', () => {
    const state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    const [clipped] = entriesOverlappingDay(state.entries, DATE, at(9, 30))
    expect(isOpen(clipped)).toBe(true)
  })
})

describe('findOverlaps', () => {
  it('finds a hand-edited overlap', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = stopTracking(state, at(9, 30), 'user')
    state = startTracking(state, { task: task('b'), source: 'manual' }, at(10), 'e2')
    state = stopTracking(state, at(10, 30), 'user')
    // Drag e2's start back over e1.
    state = editEntry(state, 'e2', { startedAt: at(9, 20).toISOString() }, at(11))
    expect(findOverlaps(state.entries, at(11))).toEqual([['e1', 'e2']])
  })

  it('finds nothing on a live-tracked day — the invariant makes it impossible', () => {
    let state = startTracking(EMPTY, { task: task('a'), source: 'manual' }, at(9), 'e1')
    state = startTracking(state, { task: task('b'), source: 'manual' }, at(9, 10), 'e2')
    state = startTracking(state, { task: task('c'), source: 'manual' }, at(9, 20), 'e3')
    expect(findOverlaps(state.entries, at(9, 30))).toEqual([])
  })
})
