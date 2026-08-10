import { describe, it, expect } from 'vitest'
import { matchTier, searchTasks } from './taskSearch'
import type { HabitTask, RewardTask, TodoTask } from '@/lib/habitica/types'

function todo(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: overrides.id ?? 't1',
    _id: overrides.id ?? 't1',
    type: 'todo',
    text: 'default title',
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

function habit(overrides: Partial<HabitTask> = {}): HabitTask {
  return {
    id: overrides.id ?? 'h1',
    _id: overrides.id ?? 'h1',
    type: 'habit',
    text: 'default habit',
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
    id: overrides.id ?? 'r1',
    _id: overrides.id ?? 'r1',
    type: 'reward',
    text: 'default reward',
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

describe('matchTier', () => {
  it('returns null for no match', () => {
    expect(matchTier(todo({ text: 'Buy milk' }), 'xyz')).toBeNull()
  })

  it('returns null for an empty or whitespace-only query', () => {
    expect(matchTier(todo({ text: 'Buy milk' }), '')).toBeNull()
    expect(matchTier(todo({ text: 'Buy milk' }), '   ')).toBeNull()
  })

  it('matches the title, case-insensitively', () => {
    expect(matchTier(todo({ text: 'Buy Milk' }), 'milk')).toBe('title')
    expect(matchTier(todo({ text: 'Buy Milk' }), 'MILK')).toBe('title')
  })

  it('matches a checklist item when the title does not match', () => {
    const task = todo({ text: 'Groceries', checklist: [{ id: 'c1', text: 'oat milk', completed: false }] })
    expect(matchTier(task, 'oat milk')).toBe('checklist')
  })

  it('matches notes when neither title nor checklist match', () => {
    const task = todo({ text: 'Groceries', notes: 'remember the oat milk brand' })
    expect(matchTier(task, 'oat milk')).toBe('notes')
  })

  it('title wins over checklist and notes when several match', () => {
    const task = todo({
      text: 'Buy milk',
      notes: 'milk milk milk',
      checklist: [{ id: 'c1', text: 'milk', completed: false }],
    })
    expect(matchTier(task, 'milk')).toBe('title')
  })

  it('checklist wins over notes when both match but title does not', () => {
    const task = todo({
      text: 'Groceries',
      notes: 'get some milk too',
      checklist: [{ id: 'c1', text: 'milk', completed: false }],
    })
    expect(matchTier(task, 'milk')).toBe('checklist')
  })

  it('habits/rewards have no checklist — matching falls through to notes without crashing', () => {
    expect(matchTier(habit({ text: 'Meditate', notes: 'ten minutes of quiet' }), 'quiet')).toBe('notes')
    expect(matchTier(reward({ text: 'Coffee', notes: 'oat milk latte' }), 'oat milk')).toBe('notes')
  })
})

describe('searchTasks', () => {
  it('returns the input completely unchanged for an empty query', () => {
    const tasks = [todo({ id: 'a' }), todo({ id: 'b' })]
    expect(searchTasks(tasks, '')).toBe(tasks) // same reference, not just equal
    expect(searchTasks(tasks, '   ')).toBe(tasks)
  })

  it('filters out non-matching tasks entirely', () => {
    const a = todo({ id: 'a', text: 'Buy milk' })
    const b = todo({ id: 'b', text: 'Walk the dog' })
    expect(searchTasks([a, b], 'milk')).toEqual([a])
  })

  it('sorts title matches before checklist matches before notes matches', () => {
    const notesMatch = todo({ id: 'notes', text: 'Groceries', notes: 'buy milk' })
    const titleMatch = todo({ id: 'title', text: 'Get milk' })
    const checklistMatch = todo({
      id: 'checklist',
      text: 'Errands',
      checklist: [{ id: 'c1', text: 'milk', completed: false }],
    })
    // Deliberately passed in an order that does NOT match tier order, so a
    // passing test proves sorting happened rather than coincidentally
    // matching input order.
    const result = searchTasks([notesMatch, checklistMatch, titleMatch], 'milk')
    expect(result.map((t) => t.id)).toEqual(['title', 'checklist', 'notes'])
  })

  it('preserves original relative order for ties within the same tier (stable sort)', () => {
    const a = todo({ id: 'a', text: 'milk run 1' })
    const b = todo({ id: 'b', text: 'milk run 2' })
    const c = todo({ id: 'c', text: 'milk run 3' })
    expect(searchTasks([c, a, b], 'milk').map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('mixed task types all search correctly', () => {
    const h = habit({ id: 'h', text: 'Read for milk-and-cookies book club' })
    const r = reward({ id: 'r', text: 'Milkshake' })
    const t = todo({ id: 't', text: 'Buy milk' })
    const result = searchTasks([h, r, t], 'milk')
    expect(result.map((x) => x.id).sort()).toEqual(['h', 'r', 't'])
  })
})
