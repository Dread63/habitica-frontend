import { describe, expect, it } from 'vitest'
import { createTimelineEntry, type TimelineEntry } from '@/features/timeline/timelineEntries'
import { comparePlanToActual, timeEntryToDayBand } from './planVsActual'
import type { TimeEntry } from './timeEntries'

const DATE = '2026-08-27'
const at = (h: number, m = 0) => new Date(2026, 7, 27, h, m, 0, 0)
const NOW = at(18)

function plan(taskId: string, startHour: number, durationMinutes: number): TimelineEntry {
  return createTimelineEntry(
    {
      taskId,
      date: DATE,
      startMinutes: startHour * 60,
      durationMinutes,
      taskSnapshot: { text: `Task ${taskId}`, type: 'todo', tagIds: [] },
    },
    `plan-${taskId}`,
    '2026-08-27T00:00:00.000Z',
    0,
  )
}

function actual(taskId: string, startHour: number, startMin: number, endHour: number, endMin: number): TimeEntry {
  return {
    id: `entry-${taskId}-${startHour}${startMin}`,
    taskId,
    startedAt: at(startHour, startMin).toISOString(),
    endedAt: at(endHour, endMin).toISOString(),
    taskSnapshot: { text: `Task ${taskId}`, type: 'todo', tagIds: [] },
    source: 'manual',
    createdAt: at(startHour, startMin).toISOString(),
    updatedAt: 0,
  }
}

const minutes = (ms: number) => Math.round(ms / 60_000)

describe('comparePlanToActual', () => {
  it('reports planned and tracked side by side, per task', () => {
    const result = comparePlanToActual([plan('essay', 9, 60)], [actual('essay', 9, 0, 10, 22)], DATE, NOW)
    expect(result.rows).toEqual([
      { taskId: 'essay', text: 'Task essay', plannedMs: 60 * 60_000, actualMs: 82 * 60_000, deltaMs: 22 * 60_000 },
    ])
    expect(minutes(result.plannedMs)).toBe(60)
    expect(minutes(result.trackedMs)).toBe(82)
  })

  it('counts adherence only where the tracked task matches the planned one', () => {
    // Planned essay 9–10; actually did essay 9:00–9:40 then report 9:40–10:00.
    const result = comparePlanToActual(
      [plan('essay', 9, 60)],
      [actual('essay', 9, 0, 9, 40), actual('report', 9, 40, 10, 0)],
      DATE,
      NOW,
    )
    expect(minutes(result.adherentMs)).toBe(40)
    expect(minutes(result.trackedMs)).toBe(60)
  })

  it('is zero-adherent when you tracked something you never planned', () => {
    const result = comparePlanToActual([plan('essay', 9, 60)], [actual('email', 9, 0, 10, 0)], DATE, NOW)
    expect(result.adherentMs).toBe(0)
    expect(result.rows.map((r) => r.taskId).sort()).toEqual(['email', 'essay'])
  })

  it('includes a planned task that was never tracked, with a negative delta', () => {
    const result = comparePlanToActual([plan('skipped', 14, 30)], [], DATE, NOW)
    expect(result.rows[0]).toMatchObject({ taskId: 'skipped', actualMs: 0, deltaMs: -30 * 60_000 })
  })

  it('ignores plan blocks from other days', () => {
    const other = createTimelineEntry(
      { taskId: 'x', date: '2026-08-26', startMinutes: 540, durationMinutes: 60 },
      'plan-x',
      '2026-08-26T00:00:00.000Z',
      0,
    )
    expect(comparePlanToActual([other], [], DATE, NOW).plannedMs).toBe(0)
  })

  it('handles an empty day without dividing by anything', () => {
    expect(comparePlanToActual([], [], DATE, NOW)).toEqual({
      rows: [],
      plannedMs: 0,
      trackedMs: 0,
      adherentMs: 0,
    })
  })

  it('returns an empty comparison for an unparseable date rather than throwing', () => {
    expect(comparePlanToActual([plan('a', 9, 60)], [], 'not-a-date', NOW).rows).toEqual([])
  })
})

describe('timeEntryToDayBand', () => {
  it('maps an interval to minutes since local midnight', () => {
    expect(timeEntryToDayBand(actual('a', 9, 30, 10, 15), DATE, NOW)).toEqual({
      startMinutes: 570,
      endMinutes: 615,
    })
  })

  it('clips an entry crossing midnight to the day being drawn', () => {
    const crossing: TimeEntry = {
      ...actual('a', 23, 50, 23, 59),
      startedAt: at(23, 50).toISOString(),
      endedAt: new Date(2026, 7, 28, 0, 20).toISOString(),
    }
    expect(timeEntryToDayBand(crossing, DATE, NOW)).toEqual({ startMinutes: 1430, endMinutes: 1440 })
    expect(timeEntryToDayBand(crossing, '2026-08-28', NOW)).toEqual({ startMinutes: 0, endMinutes: 20 })
  })

  it('returns null for a day the entry does not touch', () => {
    expect(timeEntryToDayBand(actual('a', 9, 0, 10, 0), '2026-08-25', NOW)).toBeNull()
  })
})
