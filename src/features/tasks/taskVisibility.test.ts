import { describe, expect, it } from 'vitest'
import { filterCompleted, filterScheduledOnly } from './taskVisibility'
import type { DailyTask, TodoTask } from '@/lib/habitica/types'

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

describe('filterCompleted', () => {
  it('hides completed tasks when showCompleted is false', () => {
    const tasks = [todo({ id: 'a', completed: true }), todo({ id: 'b', completed: false })]
    expect(filterCompleted(tasks, false).map((t) => t.id)).toEqual(['b'])
  })

  it('shows everything, unchanged, when showCompleted is true', () => {
    const tasks = [todo({ id: 'a', completed: true }), todo({ id: 'b', completed: false })]
    expect(filterCompleted(tasks, true)).toEqual(tasks)
  })

  it('works the same way for dailies', () => {
    const tasks = [daily({ id: 'a', completed: true }), daily({ id: 'b', completed: false })]
    expect(filterCompleted(tasks, false).map((t) => t.id)).toEqual(['b'])
  })
})

describe('filterScheduledOnly', () => {
  it('narrows to todos with a due date when scheduledOnly is true', () => {
    const tasks = [todo({ id: 'a', date: '2026-08-01' }), todo({ id: 'b' })]
    expect(filterScheduledOnly(tasks, true).map((t) => t.id)).toEqual(['a'])
  })

  it('returns everything, unchanged, when scheduledOnly is false', () => {
    const tasks = [todo({ id: 'a', date: '2026-08-01' }), todo({ id: 'b' })]
    expect(filterScheduledOnly(tasks, false)).toEqual(tasks)
  })
})
