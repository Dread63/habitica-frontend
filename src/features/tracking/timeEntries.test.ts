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
  insertEntry,
  isOpen,
  MIN_ENTRY_MS,
  openEntryOf,
  splitEntry,
  startTracking,
  stopTracking,
  timeEntryToDayBand,
  totalDurationMs,
  wasEdited,
  type TimeEntry,
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

describe('timeEntryToDayBand', () => {
  const NOW = at(18)
  const band = (startH: number, startM: number, endH: number, endM: number): TimeEntry => ({
    id: 'band',
    taskId: 'a',
    startedAt: at(startH, startM).toISOString(),
    endedAt: at(endH, endM).toISOString(),
    taskSnapshot: { text: 'Task a', type: 'todo', tagIds: [] },
    source: 'manual',
    createdAt: at(startH, startM).toISOString(),
    updatedAt: 0,
  })

  it('maps an interval to minutes since local midnight', () => {
    expect(timeEntryToDayBand(band(9, 30, 10, 15), DATE, NOW)).toEqual({
      startMinutes: 570,
      endMinutes: 615,
    })
  })

  it('clips an entry crossing midnight to the day being drawn', () => {
    const crossing: TimeEntry = {
      ...band(23, 50, 23, 59),
      endedAt: new Date(2026, 7, 28, 0, 20).toISOString(),
    }
    expect(timeEntryToDayBand(crossing, DATE, NOW)).toEqual({ startMinutes: 1430, endMinutes: 1440 })
    expect(timeEntryToDayBand(crossing, '2026-08-28', NOW)).toEqual({ startMinutes: 0, endMinutes: 20 })
  })

  it('returns null for a day the entry does not touch', () => {
    expect(timeEntryToDayBand(band(9, 0, 10, 0), '2026-08-25', NOW)).toBeNull()
  })

  it('returns null for an unparseable date rather than guessing', () => {
    expect(timeEntryToDayBand(band(9, 0, 10, 0), 'not-a-date', NOW)).toBeNull()
  })
})

describe('insertEntry', () => {
  const NOW = at(18)
  const SUBJECT = { id: 'activity:it support', text: 'IT support', tagIds: ['tag-1'] }

  /** A closed entry from h:m to h:m on the fixture day. */
  function closed(id: string, taskId: string, fromH: number, fromM: number, toH: number, toM: number): TimeEntry {
    return {
      id,
      taskId,
      startedAt: at(fromH, fromM).toISOString(),
      endedAt: at(toH, toM).toISOString(),
      taskSnapshot: { text: `Task ${taskId}`, type: 'todo', tagIds: [] },
      source: 'manual',
      createdAt: at(fromH, fromM).toISOString(),
      updatedAt: 0,
    }
  }

  const stateOf = (...entries: TimeEntry[]): TimeEntryState => ({ entries, tombstones: {} })
  const span = (e: TimeEntry) => [e.startedAt, e.endedAt] as const
  const byId = (s: TimeEntryState, id: string) => s.entries.find((e) => e.id === id)
  const inserted = (s: TimeEntryState) => s.entries.find((e) => e.taskId === SUBJECT.id)!
  const insert = (state: TimeEntryState, fromH: number, fromM: number, toH: number, toM: number, ids = ['new']) =>
    insertEntry(
      state,
      { subject: SUBJECT, startedAt: at(fromH, fromM).toISOString(), endedAt: at(toH, toM).toISOString() },
      NOW,
      ids,
    )

  it('appends when nothing overlaps', () => {
    const before = stateOf(closed('e1', 'a', 9, 0, 10, 0))
    const after = insert(before, 11, 0, 11, 30)

    expect(after.entries).toHaveLength(2)
    expect(byId(after, 'e1')).toEqual(before.entries[0])
    expect(span(inserted(after))).toEqual([at(11, 0).toISOString(), at(11, 30).toISOString()])
    expect(findOverlaps(after.entries, NOW)).toEqual([])
  })

  it('treats a merely touching interval as no overlap', () => {
    // Half-open intervals: 10:00-11:00 does not overlap 09:00-10:00.
    const after = insert(stateOf(closed('e1', 'a', 9, 0, 10, 0)), 10, 0, 11, 0)
    expect(byId(after, 'e1')!.endedAt).toBe(at(10, 0).toISOString())
    expect(findOverlaps(after.entries, NOW)).toEqual([])
  })

  it('trims the end of an entry it overlaps at the tail', () => {
    const after = insert(stateOf(closed('e1', 'a', 9, 0, 10, 0)), 9, 40, 10, 30)

    expect(after.entries).toHaveLength(2)
    expect(span(byId(after, 'e1')!)).toEqual([at(9, 0).toISOString(), at(9, 40).toISOString()])
    expect(findOverlaps(after.entries, NOW)).toEqual([])
  })

  it('advances the start of an entry it overlaps at the head', () => {
    const after = insert(stateOf(closed('e1', 'a', 9, 0, 10, 0)), 8, 30, 9, 20)

    expect(after.entries).toHaveLength(2)
    expect(span(byId(after, 'e1')!)).toEqual([at(9, 20).toISOString(), at(10, 0).toISOString()])
    expect(findOverlaps(after.entries, NOW)).toEqual([])
  })

  it('splits an entry it lands strictly inside, keeping the id on the head', () => {
    // The reported scenario: two hours logged on the report, forty minutes of
    // which were actually IT support.
    const after = insert(stateOf(closed('e1', 'a', 9, 0, 11, 0)), 9, 40, 10, 20)

    expect(after.entries).toHaveLength(3)
    expect(span(byId(after, 'e1')!)).toEqual([at(9, 0).toISOString(), at(9, 40).toISOString()])
    const tail = byId(after, 'new')!
    expect(span(tail)).toEqual([at(10, 20).toISOString(), at(11, 0).toISOString()])
    expect(tail.splitFromId).toBe('e1')
    expect(tail.taskId).toBe('a')
    expect(findOverlaps(after.entries, NOW)).toEqual([])
  })

  it('conserves total duration across a split, minus the inserted span', () => {
    const before = stateOf(closed('e1', 'a', 9, 0, 11, 0))
    const after = insert(before, 9, 40, 10, 20)

    expect(totalDurationMs(after.entries, NOW)).toBe(totalDurationMs(before.entries, NOW))
  })

  it('retargets in place when the span matches exactly, keeping the id and the audit', () => {
    const after = insert(stateOf(closed('e1', 'a', 9, 0, 10, 0)), 9, 0, 10, 0)

    expect(after.entries).toHaveLength(1)
    const entry = byId(after, 'e1')!
    expect(entry.taskId).toBe(SUBJECT.id)
    expect(entry.taskSnapshot).toEqual({ text: 'IT support', type: undefined, tagIds: ['tag-1'] })
    expect(entry.audit?.original.taskId).toBe('a')
    expect(entry.audit?.editCount).toBe(1)
  })

  it('deletes an entry it fully covers, leaving a tombstone', () => {
    const after = insert(stateOf(closed('e1', 'a', 9, 30, 9, 45)), 9, 0, 10, 0)

    expect(byId(after, 'e1')).toBeUndefined()
    expect(after.tombstones).toHaveProperty('e1')
    expect(after.entries).toHaveLength(1)
  })

  it('spans several entries: trims the outer two and deletes the covered middle', () => {
    const before = stateOf(
      closed('e1', 'a', 9, 0, 10, 0),
      closed('e2', 'b', 10, 0, 10, 30),
      closed('e3', 'c', 10, 30, 11, 30),
    )
    const after = insert(before, 9, 30, 11, 0)

    expect(span(byId(after, 'e1')!)).toEqual([at(9, 0).toISOString(), at(9, 30).toISOString()])
    expect(byId(after, 'e2')).toBeUndefined()
    expect(after.tombstones).toHaveProperty('e2')
    expect(span(byId(after, 'e3')!)).toEqual([at(11, 0).toISOString(), at(11, 30).toISOString()])
    expect(findOverlaps(after.entries, NOW)).toEqual([])
  })

  it('drops a remnant shorter than MIN_ENTRY_MS rather than recording it', () => {
    // 09:00-10:00 with an insert at 09:00:02 would leave a two-second head.
    const before = stateOf(closed('e1', 'a', 9, 0, 10, 0))
    const after = insertEntry(
      before,
      { subject: SUBJECT, startedAt: at(9, 0, 2).toISOString(), endedAt: at(9, 30).toISOString() },
      NOW,
      ['new'],
    )

    // The entry survives as its tail, keeping its identity.
    expect(span(byId(after, 'e1')!)).toEqual([at(9, 30).toISOString(), at(10, 0).toISOString()])
    expect(after.entries).toHaveLength(2)
    expect(findOverlaps(after.entries, NOW)).toEqual([])
  })

  it('carves the open entry and leaves the piece that still runs to now open', () => {
    const open: TimeEntry = { ...closed('e1', 'a', 9, 0, 10, 0), endedAt: null }
    const after = insertEntry(
      { entries: [open], tombstones: {} },
      { subject: SUBJECT, startedAt: at(9, 40).toISOString(), endedAt: at(10, 20).toISOString() },
      NOW,
      ['new'],
    )

    expect(byId(after, 'e1')!.endedAt).toBe(at(9, 40).toISOString())
    const tail = byId(after, 'new')!
    expect(tail.startedAt).toBe(at(10, 20).toISOString())
    // Exactly one open entry survives — the invariant the whole ledger rests on.
    expect(after.entries.filter(isOpen)).toHaveLength(1)
    expect(openEntryOf(after.entries)!.id).toBe('new')
  })

  it('leaves nothing open when the insert covers the open entry entirely', () => {
    const open: TimeEntry = { ...closed('e1', 'a', 17, 0, 18, 0), endedAt: null }
    const after = insertEntry(
      { entries: [open], tombstones: {} },
      { subject: SUBJECT, startedAt: at(16, 0).toISOString(), endedAt: at(18, 0).toISOString() },
      NOW,
      ['new'],
    )

    expect(after.entries.filter(isOpen)).toHaveLength(0)
    expect(after.tombstones).toHaveProperty('e1')
  })

  it('records an interval that crosses midnight without splitting it', () => {
    const after = insertEntry(
      { entries: [], tombstones: {} },
      {
        subject: SUBJECT,
        startedAt: at(23, 40).toISOString(),
        endedAt: new Date(2026, 7, 28, 0, 20).toISOString(),
      },
      NOW,
      ['new'],
    )

    expect(after.entries).toHaveLength(1)
    expect(entriesOverlappingDay(after.entries, DATE, NOW)).toHaveLength(1)
    expect(entriesOverlappingDay(after.entries, '2026-08-28', NOW)).toHaveLength(1)
  })

  it('marks the new entry as backfilled rather than recorded live', () => {
    const after = insert(stateOf(), 11, 0, 11, 30)
    expect(inserted(after).source).toBe('backfill')
    expect(inserted(after).closedBy).toBe('user')
    // Not an edit — nothing was misstated, this interval simply never existed.
    expect(inserted(after).audit).toBeUndefined()
  })

  it('refuses a span that is backwards, zero-length, or unparseable', () => {
    const before = stateOf(closed('e1', 'a', 9, 0, 10, 0))
    expect(insert(before, 10, 0, 9, 0)).toBe(before)
    expect(insert(before, 9, 30, 9, 30)).toBe(before)
    expect(
      insertEntry(before, { subject: SUBJECT, startedAt: 'nonsense', endedAt: 'also nonsense' }, NOW),
    ).toBe(before)
  })

  it('mints a real id when none is injected', () => {
    const after = insertEntry(
      stateOf(),
      { subject: SUBJECT, startedAt: at(11).toISOString(), endedAt: at(12).toISOString() },
      NOW,
    )
    expect(after.entries[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })
})

