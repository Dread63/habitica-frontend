import { describe, expect, it } from 'vitest'
import { bucketOf, compareTodos, groupTodosByDueDate } from './todoBuckets'
import type { TodoTask } from '@/lib/habitica/types'

/** Fixed reference point so every bucket boundary below is deterministic. */
const NOW = new Date('2026-08-10T13:00:00.000Z')

function todo(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: 't1',
    _id: 't1',
    type: 'todo',
    text: 'todo',
    notes: '',
    tags: [],
    value: 0,
    priority: 1,
    attribute: 'str',
    challenge: {},
    group: {},
    reminders: [],
    createdAt: '',
    updatedAt: '',
    completed: false,
    collapseChecklist: false,
    checklist: [],
    ...overrides,
  }
}

/** Builds a due date `days` from NOW's local midnight, at midday to stay clear of DST edges. */
function dueInDays(days: number): string {
  const d = new Date(NOW)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  d.setHours(12)
  return d.toISOString()
}

describe('bucketOf', () => {
  it('puts undated todos in someday', () => {
    expect(bucketOf(todo(), NOW)).toBe('someday')
  })

  it('puts overdue todos in today, alongside those actually due today', () => {
    expect(bucketOf(todo({ date: dueInDays(-30) }), NOW)).toBe('today')
    expect(bucketOf(todo({ date: dueInDays(-1) }), NOW)).toBe('today')
    expect(bucketOf(todo({ date: dueInDays(0) }), NOW)).toBe('today')
  })

  it('counts a task due earlier today (already past, same day) as today, not later', () => {
    const earlierToday = new Date(NOW)
    earlierToday.setHours(1)
    expect(bucketOf(todo({ date: earlierToday.toISOString() }), NOW)).toBe('today')
  })

  it('puts the next 7 days in week', () => {
    expect(bucketOf(todo({ date: dueInDays(1) }), NOW)).toBe('week')
    expect(bucketOf(todo({ date: dueInDays(7) }), NOW)).toBe('week')
  })

  it('puts day 8 onward in later — the exact boundary the 7-day window turns on', () => {
    expect(bucketOf(todo({ date: dueInDays(8) }), NOW)).toBe('later')
    expect(bucketOf(todo({ date: dueInDays(60) }), NOW)).toBe('later')
  })
})

describe('compareTodos', () => {
  it('sorts soonest due date first', () => {
    const later = todo({ id: 'later', date: dueInDays(5) })
    const sooner = todo({ id: 'sooner', date: dueInDays(2) })
    expect([later, sooner].sort(compareTodos).map((t) => t.id)).toEqual(['sooner', 'later'])
  })

  it('breaks ties on the same due date by value ascending (reddest/most neglected first)', () => {
    const fresh = todo({ id: 'fresh', date: dueInDays(2), value: 8 })
    const neglected = todo({ id: 'neglected', date: dueInDays(2), value: -12 })
    expect([fresh, neglected].sort(compareTodos).map((t) => t.id)).toEqual(['neglected', 'fresh'])
  })

  it('sorts undated after dated', () => {
    const dated = todo({ id: 'dated', date: dueInDays(30) })
    const undated = todo({ id: 'undated' })
    expect([undated, dated].sort(compareTodos).map((t) => t.id)).toEqual(['dated', 'undated'])
  })

  it('falls through to value when neither has a date — the whole someday bucket', () => {
    const fresh = todo({ id: 'fresh', value: 5 })
    const neglected = todo({ id: 'neglected', value: -20 })
    expect([fresh, neglected].sort(compareTodos).map((t) => t.id)).toEqual(['neglected', 'fresh'])
  })
})

describe('groupTodosByDueDate', () => {
  it('places every todo in exactly one bucket, dropping nothing', () => {
    const todos = [
      todo({ id: 'overdue', date: dueInDays(-2) }),
      todo({ id: 'soon', date: dueInDays(3) }),
      todo({ id: 'far', date: dueInDays(40) }),
      todo({ id: 'none' }),
    ]
    const buckets = groupTodosByDueDate(todos, NOW)
    expect(buckets.today.map((t) => t.id)).toEqual(['overdue'])
    expect(buckets.week.map((t) => t.id)).toEqual(['soon'])
    expect(buckets.later.map((t) => t.id)).toEqual(['far'])
    expect(buckets.someday.map((t) => t.id)).toEqual(['none'])

    const total = Object.values(buckets).reduce((sum, list) => sum + list.length, 0)
    expect(total).toBe(todos.length)
  })

  it('sorts within each bucket', () => {
    const todos = [
      todo({ id: 'day5', date: dueInDays(5) }),
      todo({ id: 'day2', date: dueInDays(2) }),
      todo({ id: 'day3', date: dueInDays(3) }),
    ]
    expect(groupTodosByDueDate(todos, NOW).week.map((t) => t.id)).toEqual(['day2', 'day3', 'day5'])
  })

  it('returns all four buckets even when some are empty', () => {
    const buckets = groupTodosByDueDate([], NOW)
    expect(Object.keys(buckets).sort()).toEqual(['later', 'someday', 'today', 'week'])
  })

  it('does not mutate the input array', () => {
    const input = [todo({ id: 'b', date: dueInDays(5) }), todo({ id: 'a', date: dueInDays(1) })]
    const original = input.map((t) => t.id)
    groupTodosByDueDate(input, NOW)
    expect(input.map((t) => t.id)).toEqual(original)
  })
})
