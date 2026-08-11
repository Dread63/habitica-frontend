import { describe, expect, it } from 'vitest'
import { getDueDate, isOverdue, sortTasksByDueDate } from './taskDueDate'
import type { DailyTask, HabitTask, RewardTask, TodoTask } from '@/lib/habitica/types'

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

function daily(overrides: Partial<DailyTask> = {}): DailyTask {
  return {
    id: 'd1',
    _id: 'd1',
    type: 'daily',
    text: 'daily',
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
    frequency: 'daily',
    everyX: 1,
    startDate: '',
    repeat: { m: true, t: true, w: true, th: true, f: true, s: true, su: true },
    streak: 0,
    daysOfMonth: [],
    weeksOfMonth: [],
    yesterDaily: true,
    completed: false,
    collapseChecklist: false,
    checklist: [],
    history: [],
    ...overrides,
  }
}

function habit(overrides: Partial<HabitTask> = {}): HabitTask {
  return {
    id: 'h1',
    _id: 'h1',
    type: 'habit',
    text: 'habit',
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
    up: true,
    down: true,
    counterUp: 0,
    counterDown: 0,
    frequency: 'daily',
    history: [],
    ...overrides,
  }
}

function reward(overrides: Partial<RewardTask> = {}): RewardTask {
  return {
    id: 'r1',
    _id: 'r1',
    type: 'reward',
    text: 'reward',
    notes: '',
    tags: [],
    value: 10,
    priority: 1,
    attribute: 'str',
    challenge: {},
    group: {},
    reminders: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('getDueDate', () => {
  it('reads a todo due date from `date`', () => {
    expect(getDueDate(todo({ date: '2026-08-15' }))?.toISOString().slice(0, 10)).toBe('2026-08-15')
  })

  it('is null for a todo with no due date', () => {
    expect(getDueDate(todo())).toBeNull()
  })

  it("reads a daily's next occurrence from nextDue[0]", () => {
    expect(getDueDate(daily({ nextDue: ['2026-08-20T00:00:00.000Z', '2026-08-21T00:00:00.000Z'] }))?.toISOString()).toBe(
      '2026-08-20T00:00:00.000Z',
    )
  })

  it('is null for a daily with an empty/missing nextDue', () => {
    expect(getDueDate(daily({ nextDue: [] }))).toBeNull()
    expect(getDueDate(daily())).toBeNull()
  })

  it('is always null for habits and rewards', () => {
    expect(getDueDate(habit())).toBeNull()
    expect(getDueDate(reward())).toBeNull()
  })
})

describe('isOverdue', () => {
  it('is true for a past-due, incomplete todo', () => {
    expect(isOverdue(todo({ date: '2000-01-01' }))).toBe(true)
  })

  it('is false once the todo is completed, even if past-due', () => {
    expect(isOverdue(todo({ date: '2000-01-01', completed: true }))).toBe(false)
  })

  it('is false for a todo with no due date', () => {
    expect(isOverdue(todo())).toBe(false)
  })

  it('is never true for dailies — a due-but-not-done daily is expected, not overdue', () => {
    expect(isOverdue(daily({ nextDue: ['2000-01-01T00:00:00.000Z'] }))).toBe(false)
  })
})

describe('sortTasksByDueDate', () => {
  it('sorts ascending by due date', () => {
    const later = todo({ id: 'a', date: '2026-09-01' })
    const sooner = todo({ id: 'b', date: '2026-08-01' })
    expect(sortTasksByDueDate([later, sooner]).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('pushes due-less tasks to the end, not the start', () => {
    const dated = todo({ id: 'dated', date: '2026-08-01' })
    const undated = todo({ id: 'undated' })
    expect(sortTasksByDueDate([undated, dated]).map((t) => t.id)).toEqual(['dated', 'undated'])
  })

  it('keeps relative order for ties (stable sort) — e.g. two tasks with no due date', () => {
    const a = todo({ id: 'a' })
    const b = todo({ id: 'b' })
    expect(sortTasksByDueDate([a, b]).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const input = [todo({ id: 'a', date: '2026-09-01' }), todo({ id: 'b', date: '2026-08-01' })]
    const original = [...input]
    sortTasksByDueDate(input)
    expect(input).toEqual(original)
  })
})
