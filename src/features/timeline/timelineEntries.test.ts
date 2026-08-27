import { describe, expect, it } from 'vitest'
import {
  clampStartMinutes,
  createTimelineEntry,
  currentOrNextEntry,
  entriesForDate,
  entriesInWindow,
  entryForTaskOnDate,
  entryInterval,
  focusCandidateEntries,
  moveEntry,
  nextGridStart,
  removeEntriesForTask,
  rescheduleEntry,
  resizeEntry,
  snapToGrid,
  syncTaskSnapshots,
  TIMELINE_MIN_DURATION_MINUTES,
  type TimelineEntry,
  type TimelineTaskSnapshot,
} from './timelineEntries'

function entry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: 'e1',
    taskId: 't1',
    date: '2026-08-25',
    startMinutes: 540,
    durationMinutes: 30,
    createdAt: '2026-08-25T09:00:00.000Z',
    updatedAt: 0,
    ...overrides,
  }
}

describe('createTimelineEntry', () => {
  it('is deterministic with injected id/createdAt', () => {
    const a = createTimelineEntry(
      { taskId: 't1', date: '2026-08-25', startMinutes: 540, durationMinutes: 30 },
      'fixed-id',
      '2026-08-25T00:00:00.000Z',
      1234,
    )
    expect(a).toEqual({
      id: 'fixed-id',
      taskId: 't1',
      date: '2026-08-25',
      startMinutes: 540,
      durationMinutes: 30,
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: 1234,
      taskSnapshot: undefined,
    })
  })

  it('clamps start into the day and duration to the day boundary', () => {
    const late = createTimelineEntry(
      { taskId: 't1', date: '2026-08-25', startMinutes: 1430, durationMinutes: 120 },
      'id',
      'c',
    )
    expect(late.startMinutes).toBe(1430)
    expect(late.durationMinutes).toBe(10) // capped at midnight
    const negative = createTimelineEntry(
      { taskId: 't1', date: '2026-08-25', startMinutes: -50, durationMinutes: 1 },
      'id',
      'c',
    )
    expect(negative.startMinutes).toBe(0)
    expect(negative.durationMinutes).toBe(TIMELINE_MIN_DURATION_MINUTES)
  })
})

describe('clampStartMinutes / snapToGrid', () => {
  it('clamps into [0, 1439]', () => {
    expect(clampStartMinutes(-5)).toBe(0)
    expect(clampStartMinutes(1500)).toBe(1439)
    expect(clampStartMinutes(600)).toBe(600)
  })

  it('nextGridStart rounds up (never back into the past) and caps near midnight', () => {
    expect(nextGridStart(541)).toBe(555)
    expect(nextGridStart(540)).toBe(540) // already on the grid
    expect(nextGridStart(1435)).toBe(1410) // capped so a default block still fits
  })

  it('rounds to the nearest grid step in both directions, no-op on exact multiples', () => {
    expect(snapToGrid(547, 15)).toBe(540) // down
    expect(snapToGrid(553, 15)).toBe(555) // up
    expect(snapToGrid(555, 15)).toBe(555) // exact
    expect(snapToGrid(7, 15)).toBe(0)
    expect(snapToGrid(8, 15)).toBe(15)
  })
})

describe('moveEntry / resizeEntry', () => {
  it('are pure and only change the targeted field', () => {
    const original = entry()
    const moved = moveEntry(original, 600)
    expect(moved.startMinutes).toBe(600)
    expect(moved.durationMinutes).toBe(30)
    expect(original.startMinutes).toBe(540) // untouched
    const resized = resizeEntry(original, 60)
    expect(resized.durationMinutes).toBe(60)
    expect(resized.startMinutes).toBe(540)
  })

  it('keep the entry inside the day', () => {
    const moved = moveEntry(entry({ durationMinutes: 60 }), 1420)
    expect(moved.startMinutes).toBe(1380) // pulled back so 60min still fits
    const resized = resizeEntry(entry({ startMinutes: 1400 }), 500)
    expect(resized.durationMinutes).toBe(40)
    const tiny = resizeEntry(entry(), 1)
    expect(tiny.durationMinutes).toBe(TIMELINE_MIN_DURATION_MINUTES)
  })
})

describe('entriesForDate / entryForTaskOnDate', () => {
  const list = [
    entry({ id: 'b', startMinutes: 600 }),
    entry({ id: 'a', startMinutes: 540 }),
    entry({ id: 'other-day', taskId: 't1', date: '2026-08-26', startMinutes: 100 }),
    entry({ id: 'c', taskId: 't2', startMinutes: 540, createdAt: '2026-08-25T10:00:00.000Z' }),
  ]

  it('filters to the exact date and sorts by start then createdAt', () => {
    const result = entriesForDate(list, '2026-08-25')
    expect(result.map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })

  it('excludes an adjacent date even for the same task (day-boundary)', () => {
    expect(entryForTaskOnDate(list, 't1', '2026-08-25')?.id).not.toBe('other-day')
    expect(entryForTaskOnDate(list, 't1', '2026-08-26')?.id).toBe('other-day')
    expect(entryForTaskOnDate(list, 't-none', '2026-08-25')).toBeUndefined()
  })
})

describe('currentOrNextEntry', () => {
  const day = [
    entry({ id: 'morning', startMinutes: 540, durationMinutes: 60 }), // 9-10
    entry({ id: 'overlap', startMinutes: 570, durationMinutes: 60 }), // 9:30-10:30
    entry({ id: 'later', startMinutes: 720, durationMinutes: 30 }), // 12-12:30
  ]

  it('prefers the live entry; ties broken by most recently started', () => {
    expect(currentOrNextEntry(day, 545)?.id).toBe('morning')
    expect(currentOrNextEntry(day, 590)?.id).toBe('overlap') // both live, overlap started later
  })

  it('falls back to the next upcoming entry, undefined when the day is over', () => {
    expect(currentOrNextEntry(day, 660)?.id).toBe('later') // 11:00, nothing live
    expect(currentOrNextEntry(day, 800)).toBeUndefined()
    expect(currentOrNextEntry([], 600)).toBeUndefined()
  })
})

describe('entriesInWindow', () => {
  const day = [
    entry({ id: 'ended', startMinutes: 480, durationMinutes: 30 }), // 8-8:30
    entry({ id: 'live', startMinutes: 530, durationMinutes: 30 }), // 8:50-9:20
    entry({ id: 'soon', startMinutes: 555, durationMinutes: 30 }), // 9:15-9:45
    entry({ id: 'later', startMinutes: 570, durationMinutes: 30 }), // 9:30-10
  ]

  it('groups live blocks with those starting inside the session window', () => {
    // 9:00 + 25min window ends 9:25 — 'later' (9:30) is outside it.
    expect(entriesInWindow(day, 540, 25).map((e) => e.id)).toEqual(['live', 'soon'])
  })

  it('excludes already-ended blocks and returns empty when nothing overlaps', () => {
    expect(entriesInWindow(day, 620, 25)).toEqual([]) // 10:20, day over
    expect(entriesInWindow([], 540, 25)).toEqual([])
  })
})

describe('removeEntriesForTask', () => {
  it('removes every matching entry across dates, no-op when none match', () => {
    const list = [entry({ id: 'x' }), entry({ id: 'y', date: '2026-08-26' }), entry({ id: 'z', taskId: 't2' })]
    expect(removeEntriesForTask(list, 't1').map((e) => e.id)).toEqual(['z'])
    expect(removeEntriesForTask(list, 't-none')).toHaveLength(3)
  })
})

describe('entryInterval', () => {
  it('maps (date, minutes-since-midnight) to real local instants', () => {
    const interval = entryInterval(entry({ date: '2026-08-25', startMinutes: 540, durationMinutes: 45 }))!
    const expectedStart = new Date(2026, 7, 25, 9, 0, 0, 0).getTime()
    expect(interval.start).toBe(expectedStart)
    expect(interval.end).toBe(expectedStart + 45 * 60_000)
  })

  it('returns null for an unparseable date rather than guessing', () => {
    expect(entryInterval(entry({ date: 'not-a-date' }))).toBeNull()
  })
})

describe('syncTaskSnapshots', () => {
  const snapshot = (text: string, tagIds: string[] = []): TimelineTaskSnapshot => ({ text, type: 'todo', tagIds })

  it('fills in a missing snapshot and refreshes a stale one', () => {
    const list = [
      entry({ id: 'a', taskId: 't1' }),
      entry({ id: 'b', taskId: 't2', taskSnapshot: snapshot('Old name', ['x']) }),
    ]
    const result = syncTaskSnapshots(
      list,
      new Map([
        ['t1', snapshot('First')],
        ['t2', snapshot('New name', ['y'])],
      ]),
    )
    expect(result.map((e) => e.taskSnapshot?.text)).toEqual(['First', 'New name'])
    expect(result[1].taskSnapshot?.tagIds).toEqual(['y'])
  })

  it('keeps the existing snapshot for a task missing from the live list', () => {
    // The completed-to-do case: Habitica stops returning it, but the block
    // must keep its name rather than degrading to "Deleted task".
    const list = [entry({ taskId: 't1', taskSnapshot: snapshot('Ticked off') })]
    expect(syncTaskSnapshots(list, new Map())).toBe(list)
  })

  it('returns the same array reference when nothing changed', () => {
    const list = [entry({ taskId: 't1', taskSnapshot: snapshot('Same', ['x']) })]
    expect(syncTaskSnapshots(list, new Map([['t1', snapshot('Same', ['x'])]]))).toBe(list)
  })

  it('notices a tag-only change', () => {
    const list = [entry({ taskId: 't1', taskSnapshot: snapshot('Same', ['x']) })]
    const result = syncTaskSnapshots(list, new Map([['t1', snapshot('Same', ['x', 'y'])]]))
    expect(result).not.toBe(list)
    expect(result[0].taskSnapshot?.tagIds).toEqual(['x', 'y'])
  })
})

describe('focusCandidateEntries', () => {
  const open: TimelineTaskSnapshot = { text: 'Open', type: 'todo', tagIds: [] }
  const done: TimelineTaskSnapshot = { text: 'Done', type: 'todo', tagIds: [], completed: true }

  it('skips finished blocks — the regression that had the timer proposing a completed task', () => {
    // The real report: "sprint 5" finished early and ticked off, "sprint 6"
    // scheduled live in the same window. Only the open one is a candidate.
    const day = [
      entry({ id: 'sprint5', taskId: 't5', startMinutes: 540, durationMinutes: 120, taskSnapshot: done }),
      entry({ id: 'sprint6', taskId: 't6', startMinutes: 600, durationMinutes: 60, taskSnapshot: open }),
    ]
    expect(focusCandidateEntries(day, 600, 25).map((e) => e.id)).toEqual(['sprint6'])
  })

  it('falls back to the next upcoming *open* block, never a finished one', () => {
    const day = [
      entry({ id: 'done-soon', taskId: 't1', startMinutes: 700, durationMinutes: 30, taskSnapshot: done }),
      entry({ id: 'open-later', taskId: 't2', startMinutes: 800, durationMinutes: 30, taskSnapshot: open }),
    ]
    expect(focusCandidateEntries(day, 600, 25).map((e) => e.id)).toEqual(['open-later'])
  })

  it('returns nothing when every block is finished', () => {
    const day = [entry({ taskId: 't1', startMinutes: 540, durationMinutes: 120, taskSnapshot: done })]
    expect(focusCandidateEntries(day, 600, 25)).toEqual([])
  })

  it('treats a block with no snapshot yet as open rather than hiding it', () => {
    const day = [entry({ id: 'legacy', startMinutes: 600, durationMinutes: 30 })]
    expect(focusCandidateEntries(day, 600, 25).map((e) => e.id)).toEqual(['legacy'])
  })

  it('otherwise matches entriesInWindow — several live blocks all count', () => {
    const day = [
      entry({ id: 'a', taskId: 't1', startMinutes: 590, durationMinutes: 30, taskSnapshot: open }),
      entry({ id: 'b', taskId: 't2', startMinutes: 610, durationMinutes: 30, taskSnapshot: open }),
      entry({ id: 'outside', taskId: 't3', startMinutes: 700, durationMinutes: 30, taskSnapshot: open }),
    ]
    expect(focusCandidateEntries(day, 600, 25).map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('syncTaskSnapshots — completion time', () => {
  const done = (completedAt?: string): TimelineTaskSnapshot => ({
    text: 'T',
    type: 'todo',
    tagIds: [],
    completed: true,
    completedAt,
  })

  it('records the completion instant the first time it sees one', () => {
    const list = [entry({ taskId: 't1', taskSnapshot: { text: 'T', type: 'todo', tagIds: [], completed: false } })]
    const result = syncTaskSnapshots(list, new Map([['t1', done('2026-08-25T10:00:00.000Z')]]))
    expect(result[0].taskSnapshot?.completedAt).toBe('2026-08-25T10:00:00.000Z')
  })

  it('holds the first instant rather than walking it forward each poll', () => {
    // Dailies have no dateCompleted, so every sync proposes "now" — taking
    // the newest would keep pushing the cutoff and never stop the block
    // absorbing time.
    const list = [entry({ taskId: 't1', taskSnapshot: done('2026-08-25T10:00:00.000Z') })]
    const result = syncTaskSnapshots(list, new Map([['t1', done('2026-08-25T10:30:00.000Z')]]))
    expect(result).toBe(list) // nothing changed, so the same reference comes back
    expect(result[0].taskSnapshot?.completedAt).toBe('2026-08-25T10:00:00.000Z')
  })

  it('clears the instant when the task goes back to incomplete', () => {
    // A daily reset by Habitica's cron, or an undo.
    const list = [entry({ taskId: 't1', taskSnapshot: done('2026-08-25T10:00:00.000Z') })]
    const reopened: TimelineTaskSnapshot = { text: 'T', type: 'todo', tagIds: [], completed: false }
    const result = syncTaskSnapshots(list, new Map([['t1', reopened]]))
    expect(result[0].taskSnapshot?.completed).toBe(false)
    expect(result[0].taskSnapshot?.completedAt).toBeUndefined()
  })
})

describe('rescheduleEntry', () => {
  it('moves date, start and duration in one step, keeping identity', () => {
    const original = entry({ id: 'e1', taskId: 't1', date: '2026-08-25', startMinutes: 540, durationMinutes: 30 })
    const moved = rescheduleEntry(original, '2026-08-26', 480, 45)
    expect(moved).toMatchObject({ id: 'e1', taskId: 't1', date: '2026-08-26', startMinutes: 480, durationMinutes: 45 })
    expect(original.date).toBe('2026-08-25') // pure
  })

  it('clamps into the target day like the other movers do', () => {
    const moved = rescheduleEntry(entry(), '2026-08-26', 1430, 120)
    expect(moved.startMinutes).toBe(1430)
    expect(moved.durationMinutes).toBe(10) // capped at midnight
    expect(rescheduleEntry(entry(), '2026-08-26', -30, 1).startMinutes).toBe(0)
  })
})
