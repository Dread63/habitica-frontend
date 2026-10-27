import { describe, expect, it } from 'vitest'
import { createTimelineEntry, type TimelineEntry } from '@/features/timeline/timelineEntries'
import type { TimeEntry } from '@/features/tracking/timeEntries'
import { matchesActivityLabel, recentActivities, searchActivities } from './recentActivities'

const DATE = '2026-08-27'
const at = (h: number, m = 0) => new Date(2026, 7, 27, h, m, 0, 0)

function ledger(
  taskId: string,
  text: string,
  startHour: number,
  tagIds: string[] = [],
): TimeEntry {
  return {
    id: `e-${taskId}-${startHour}`,
    taskId,
    startedAt: at(startHour).toISOString(),
    endedAt: at(startHour + 1).toISOString(),
    taskSnapshot: { text, tagIds },
    source: 'manual',
    createdAt: at(startHour).toISOString(),
    updatedAt: 0,
  }
}

function plan(taskId: string, text: string, startHour: number, tagIds: string[] = []): TimelineEntry {
  return createTimelineEntry(
    {
      taskId,
      date: DATE,
      startMinutes: startHour * 60,
      durationMinutes: 30,
      taskSnapshot: { text, tagIds },
    },
    `p-${taskId}-${startHour}`,
    '2026-08-27T00:00:00.000Z',
    0,
  )
}

describe('recentActivities', () => {
  it('returns nothing when no entry references an activity', () => {
    expect(recentActivities([ledger('task-1', 'A real task', 9)], [plan('task-2', 'Another', 10)])).toEqual([])
  })

  it('finds activities in the ledger and in the plan', () => {
    const result = recentActivities(
      [ledger('activity:it support', 'IT support', 9)],
      [plan('activity:standup', 'Standup', 11)],
    )
    expect(result.map((a) => a.id)).toEqual(['activity:standup', 'activity:it support'])
  })

  it('deduplicates repeated uses into one suggestion', () => {
    const result = recentActivities(
      [ledger('activity:it support', 'IT support', 9), ledger('activity:it support', 'IT support', 14)],
      [],
    )
    expect(result).toHaveLength(1)
    expect(result[0].lastUsedAt).toBe(at(14).getTime())
  })

  it('carries label and tags forward from the MOST RECENT use', () => {
    // Re-tagging an activity is just using it again with the new tags.
    const result = recentActivities(
      [
        ledger('activity:it support', 'IT support', 9, ['old-tag']),
        ledger('activity:it support', 'IT Support', 15, ['new-tag']),
      ],
      [],
    )
    expect(result[0].text).toBe('IT Support')
    expect(result[0].tagIds).toEqual(['new-tag'])
  })

  it('lets a planned block win over an older ledger entry, and vice versa', () => {
    const later = recentActivities(
      [ledger('activity:x', 'from ledger', 9)],
      [plan('activity:x', 'from plan', 16)],
    )
    expect(later[0].text).toBe('from plan')

    const earlier = recentActivities(
      [ledger('activity:x', 'from ledger', 18)],
      [plan('activity:x', 'from plan', 16)],
    )
    expect(earlier[0].text).toBe('from ledger')
  })

  it('orders newest first, breaking ties by id deterministically', () => {
    const result = recentActivities(
      [ledger('activity:b', 'B', 9), ledger('activity:a', 'A', 9), ledger('activity:c', 'C', 17)],
      [],
    )
    expect(result.map((a) => a.id)).toEqual(['activity:c', 'activity:a', 'activity:b'])
  })

  it('honours a limit', () => {
    const result = recentActivities(
      [ledger('activity:a', 'A', 9), ledger('activity:b', 'B', 10), ledger('activity:c', 'C', 11)],
      [],
      2,
    )
    expect(result.map((a) => a.id)).toEqual(['activity:c', 'activity:b'])
  })

  it('falls back to the id label for a plan entry with no snapshot', () => {
    // v1 timeline entries predate taskSnapshot entirely.
    const bare: TimelineEntry = { ...plan('activity:it support', 'x', 9), taskSnapshot: undefined }
    expect(recentActivities([], [bare])[0].text).toBe('it support')
  })

  it('skips an entry whose startedAt cannot be parsed rather than sorting it first', () => {
    const broken: TimeEntry = { ...ledger('activity:broken', 'Broken', 9), startedAt: 'nonsense' }
    const result = recentActivities([broken, ledger('activity:ok', 'OK', 9)], [])
    expect(result.map((a) => a.id)).toEqual(['activity:ok'])
  })

  it('skips a plan entry whose date cannot be parsed', () => {
    const broken: TimelineEntry = { ...plan('activity:broken', 'Broken', 9), date: 'not-a-date' }
    expect(recentActivities([], [broken])).toEqual([])
  })
})

describe('matchesActivityLabel / searchActivities', () => {
  const list = recentActivities(
    [ledger('activity:it support', 'IT Support', 9), ledger('activity:standup', 'Standup', 10)],
    [],
  )

  it('matches case-insensitively on a substring', () => {
    expect(matchesActivityLabel(list[0], 'STAND')).toBe(true)
    expect(matchesActivityLabel(list[0], 'support')).toBe(false)
  })

  it('matches everything for an empty query', () => {
    expect(matchesActivityLabel(list[0], '  ')).toBe(true)
  })

  it('returns the input array unchanged for an empty query', () => {
    expect(searchActivities(list, '')).toBe(list)
  })

  it('filters while preserving recency order', () => {
    expect(searchActivities(list, 'p').map((a) => a.id)).toEqual(['activity:standup', 'activity:it support'])
  })
})
