import { describe, expect, it } from 'vitest'
import { createTimelineEntry } from '@/features/timeline/timelineEntries'
import {
  aggregateByCategory,
  dailyFocusSeries,
  formatFocusMinutes,
  liveFocusSession,
  LIVE_SESSION_ID,
  recordSession,
  sessionsOnDate,
  sessionTasksLabel,
  topTasks,
  totalFocusMinutes,
  untrackedMinutes,
  type PomodoroSessionRecord,
} from './pomodoroStats'
import type { FocusAttribution } from './focusAttribution'
import { IDLE_RUN_STATE, type PomodoroTaskRef } from './pomodoroEngine'

function taskRef(id: string, tagIds: string[] = [], text = `Task ${id}`): PomodoroTaskRef {
  return { id, text, tagIds }
}

function attributed(id: string, minutes: number, tagIds: string[] = []): FocusAttribution {
  return { taskId: id, text: `Task ${id}`, tagIds, minutes }
}

/** Local noon on a given local date — so day-bucketing assertions hold in any TZ. */
const localNoon = (y: number, monthIndex: number, d: number) => new Date(y, monthIndex, d, 12, 0)

function session(overrides: Partial<PomodoroSessionRecord> = {}): PomodoroSessionRecord {
  return {
    id: 's1',
    tasks: [taskRef('t1')],
    attribution: [attributed('t1', 25)],
    startedAt: localNoon(2026, 7, 25).toISOString(),
    endedAt: localNoon(2026, 7, 25).toISOString(),
    durationMinutes: 25,
    completedNaturally: true,
    ...overrides,
  }
}

describe('recordSession', () => {
  it('is deterministic with an injected id', () => {
    const { id, ...params } = session()
    void id
    expect(recordSession(params, 'fixed')).toEqual(session({ id: 'fixed' }))
  })
})

describe('aggregateByCategory', () => {
  const work = 'tag-work'
  const school = 'tag-school'
  const home = 'tag-home'

  it('credits each tracked tag on a task fully — not split between them', () => {
    const sessions = [session({ attribution: [attributed('t1', 25, [work, school])] })]
    expect(aggregateByCategory(sessions, [work, school])).toEqual({ [work]: 25, [school]: 25 })
  })

  it('measures the per-task attribution, not the session duration', () => {
    // The whole point of the rework: a 25-minute block that covered 10
    // minutes of School and 15 of Work reports exactly that, not 25 of each.
    const sessions = [
      session({
        durationMinutes: 25,
        attribution: [attributed('a', 10, [school]), attributed('b', 15, [work])],
      }),
    ]
    expect(aggregateByCategory(sessions, [work, school])).toEqual({ [school]: 10, [work]: 15 })
  })

  it('two tasks sharing a tracked tag sum rather than double-count the block', () => {
    const sessions = [
      session({ attribution: [attributed('a', 10, [work]), attributed('b', 15, [work, school])] }),
    ]
    expect(aggregateByCategory(sessions, [work, school])).toEqual({ [work]: 25, [school]: 15 })
  })

  it('ignores untracked tags and attribution with no tracked tags', () => {
    const sessions = [
      session({ id: 'a', attribution: [attributed('t1', 25, [work, home])] }),
      session({ id: 'b', attribution: [attributed('t2', 50, [home])] }),
      session({ id: 'c', attribution: [] }),
    ]
    expect(aggregateByCategory(sessions, [work])).toEqual({ [work]: 25 })
  })

  it('is a live intersection — changing the tracked set retroactively changes totals', () => {
    const sessions = [session({ attribution: [attributed('t1', 40, [home])] })]
    expect(aggregateByCategory(sessions, [])).toEqual({})
    expect(aggregateByCategory(sessions, [home])).toEqual({ [home]: 40 })
  })

  it('sums across sessions per category', () => {
    const sessions = [
      session({ id: 'a', attribution: [attributed('t1', 25, [work])] }),
      session({ id: 'b', attribution: [attributed('t2', 15, [work])] }),
    ]
    expect(aggregateByCategory(sessions, [work])).toEqual({ [work]: 40 })
  })
})

describe('untrackedMinutes', () => {
  it('is the remainder that landed on no tracked tag', () => {
    const sessions = [
      session({
        durationMinutes: 30,
        attribution: [attributed('a', 20, ['tag-work']), attributed('b', 10, ['tag-home'])],
      }),
    ]
    expect(untrackedMinutes(sessions, ['tag-work'])).toBe(10)
    expect(untrackedMinutes(sessions, ['tag-work', 'tag-home'])).toBe(0)
    expect(untrackedMinutes(sessions, [])).toBe(30)
  })
})

describe('totalFocusMinutes', () => {
  it('sums over empty/one/many', () => {
    expect(totalFocusMinutes([])).toBe(0)
    expect(totalFocusMinutes([session()])).toBe(25)
    expect(totalFocusMinutes([session(), session({ id: 'b', durationMinutes: 10 })])).toBe(35)
  })
})

describe('topTasks', () => {
  it('merges a task across sessions and ranks by minutes', () => {
    const sessions = [
      session({ id: 'a', attribution: [attributed('x', 10), attributed('y', 15)] }),
      session({ id: 'b', attribution: [attributed('x', 20)] }),
    ]
    expect(topTasks(sessions, 5)).toEqual([
      { taskId: 'x', text: 'Task x', tagIds: [], minutes: 30 },
      { taskId: 'y', text: 'Task y', tagIds: [], minutes: 15 },
    ])
  })

  it('keeps uncategorized time as its own row and honors the limit', () => {
    const sessions = [
      session({
        attribution: [
          { taskId: null, text: 'Uncategorized', tagIds: [], minutes: 40 },
          attributed('x', 5),
        ],
      }),
    ]
    expect(topTasks(sessions, 1)).toEqual([{ taskId: null, text: 'Uncategorized', tagIds: [], minutes: 40 }])
  })
})

describe('dailyFocusSeries', () => {
  const work = 'tag-work'
  const school = 'tag-school'

  it('returns one bucket per day, oldest first, ending on the anchor day', () => {
    const series = dailyFocusSeries([], 3, localNoon(2026, 7, 25), [])
    expect(series.map((d) => d.date)).toEqual(['2026-08-23', '2026-08-24', '2026-08-25'])
    expect(series.every((d) => d.totalMinutes === 0 && d.slices.length === 0)).toBe(true)
  })

  it('partitions a day into single primary categories so slices sum to the column', () => {
    // The stacked-column rule, and the one place it deliberately differs from
    // aggregateByCategory: a task tagged Work *and* School counts once here.
    const sessions = [
      session({
        durationMinutes: 30,
        attribution: [attributed('a', 20, [school, work]), attributed('b', 10, [])],
      }),
    ]
    const [day] = dailyFocusSeries(sessions, 1, localNoon(2026, 7, 25), [work, school])
    expect(day.totalMinutes).toBe(30)
    expect(day.slices).toEqual([
      { tagId: work, minutes: 20 }, // first in the tracked order wins
      { tagId: null, minutes: 10 },
    ])
    expect(day.slices.reduce((sum, s) => sum + s.minutes, 0)).toBe(day.totalMinutes)
  })

  it('orders slices by the tracked-tag order so a category keeps its color', () => {
    const sessions = [
      session({ attribution: [attributed('a', 10, [school]), attributed('b', 15, [work])] }),
    ]
    const [day] = dailyFocusSeries(sessions, 1, localNoon(2026, 7, 25), [work, school])
    expect(day.slices.map((s) => s.tagId)).toEqual([work, school])
  })

  it('buckets sessions into their own local day and counts them', () => {
    const sessions = [
      session({ id: 'a', startedAt: localNoon(2026, 7, 24).toISOString(), durationMinutes: 10 }),
      session({ id: 'b', startedAt: localNoon(2026, 7, 25).toISOString(), durationMinutes: 25 }),
      session({ id: 'c', startedAt: localNoon(2026, 7, 25).toISOString(), durationMinutes: 5 }),
    ]
    const series = dailyFocusSeries(sessions, 2, localNoon(2026, 7, 25), [])
    expect(series.map((d) => [d.date, d.totalMinutes, d.sessions])).toEqual([
      ['2026-08-24', 10, 1],
      ['2026-08-25', 30, 2],
    ])
  })
})

describe('sessionTasksLabel', () => {
  it('joins linked task titles, falls back for untracked', () => {
    expect(sessionTasksLabel({ tasks: [], attribution: [] })).toBe('Untracked focus')
    expect(
      sessionTasksLabel({ tasks: [taskRef('a', [], 'One'), taskRef('b', [], 'Two')], attribution: [] }),
    ).toBe('One · Two')
  })

  it('names the timeline blocks when nothing was explicitly linked', () => {
    expect(
      sessionTasksLabel({
        tasks: [],
        attribution: [{ taskId: 'x', text: 'From the timeline', tagIds: [], minutes: 25 }],
      }),
    ).toBe('From the timeline')
  })
})

describe('sessionsOnDate', () => {
  it('filters by the local calendar day of startedAt', () => {
    const sessions = [
      session({ id: 'today', startedAt: localNoon(2026, 7, 25).toISOString() }),
      session({ id: 'yesterday', startedAt: localNoon(2026, 7, 24).toISOString() }),
    ]
    expect(sessionsOnDate(sessions, '2026-08-25').map((s) => s.id)).toEqual(['today'])
  })
})

describe('formatFocusMinutes', () => {
  it('rounds to whole minutes', () => {
    expect(formatFocusMinutes(0)).toBe('0m')
    expect(formatFocusMinutes(7)).toBe('7m')
    expect(formatFocusMinutes(7.4)).toBe('7m')
    expect(formatFocusMinutes(7.6)).toBe('8m')
    expect(formatFocusMinutes(59)).toBe('59m')
  })

  it('switches to hours, dropping a zero minute part', () => {
    expect(formatFocusMinutes(60)).toBe('1h')
    expect(formatFocusMinutes(80)).toBe('1h 20m')
    expect(formatFocusMinutes(125)).toBe('2h 5m')
  })

  it('never prints real time as a flat 0m', () => {
    // An evenly-split slice or a session stopped seconds in is still time;
    // showing "0m" next to a visible bar reads as a bug.
    expect(formatFocusMinutes(0.4)).toBe('<1m')
    expect(formatFocusMinutes(0.01)).toBe('<1m')
  })
})

describe('liveFocusSession', () => {
  const runningWork = (segments: { startedAt: string; endedAt: string }[], runningStartedAt: string | null) => ({
    ...IDLE_RUN_STATE,
    status: runningStartedAt === null ? ('paused' as const) : ('running' as const),
    phase: 'work' as const,
    segments,
    runningStartedAt,
  })

  const nine = (m: number) => new Date(2026, 7, 25, 9, m, 0, 0)

  it('previews the in-flight phase, attributed like a committed one', () => {
    const entry = createTimelineEntry(
      {
        taskId: 't1',
        date: '2026-08-25',
        startMinutes: 9 * 60,
        durationMinutes: 60,
        taskSnapshot: { text: 'Task t1', type: 'todo', tagIds: ['tag-work'] },
      },
      'e1',
      '2026-08-25T00:00:00.000Z',
    )
    const run = runningWork([], nine(0).toISOString())
    const preview = liveFocusSession(run, [entry], nine(12))

    expect(preview?.durationMinutes).toBe(12)
    expect(preview?.attribution).toEqual([{ taskId: 't1', text: 'Task t1', tagIds: ['tag-work'], minutes: 12 }])
    // Never counts as a finished pomodoro, and keeps a stable id so React
    // keys don't churn on every tick.
    expect(preview?.completedNaturally).toBe(false)
    expect(preview?.id).toBe(LIVE_SESSION_ID)
  })

  it('freezes while paused rather than counting the pause', () => {
    const paused = runningWork([{ startedAt: nine(0).toISOString(), endedAt: nine(10).toISOString() }], null)
    expect(liveFocusSession(paused, [], nine(45))?.durationMinutes).toBe(10)
  })

  it('is null when there is nothing in flight to preview', () => {
    expect(liveFocusSession(IDLE_RUN_STATE, [], nine(10))).toBeNull()
    // Breaks aren't focus time.
    expect(liveFocusSession({ ...runningWork([], nine(0).toISOString()), phase: 'shortBreak' }, [], nine(3))).toBeNull()
    // An awaiting seam has already been committed.
    expect(
      liveFocusSession({ ...IDLE_RUN_STATE, status: 'awaiting', phase: 'work' }, [], nine(10)),
    ).toBeNull()
    // A phase that has banked no time yet has nothing to show.
    expect(liveFocusSession(runningWork([], nine(10).toISOString()), [], nine(10))).toBeNull()
  })

  it('counts toward the day it started on', () => {
    const run = runningWork([], nine(0).toISOString())
    const preview = liveFocusSession(run, [], nine(12))!
    expect(sessionsOnDate([preview], '2026-08-25')).toHaveLength(1)
    expect(sessionsOnDate([preview], '2026-08-24')).toHaveLength(0)
  })
})
