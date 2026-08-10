import { describe, it, expect } from 'vitest'
import { getTaskColorName } from './taskColor'
import type { RewardTask, TodoTask } from '@/lib/habitica/types'

function todo(overrides: Partial<TodoTask>): TodoTask {
  return {
    id: 't1',
    _id: 't1',
    type: 'todo',
    text: 'test',
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

describe('getTaskColorName', () => {
  it.each([
    [-25, 'worst'],
    [-20, 'worse'], // boundary: NOT < -20, so falls to the next bucket
    [-10.1, 'worse'],
    [-10, 'bad'], // boundary
    [-1.1, 'bad'],
    [-1, 'neutral'], // boundary
    [0, 'neutral'],
    [0.9, 'neutral'],
    [1, 'good'], // boundary
    [4.9, 'good'],
    [5, 'better'], // boundary
    [9.9, 'better'],
    [10, 'best'], // boundary
    [100, 'best'],
  ] as const)('value %d -> %s', (value, expected) => {
    expect(getTaskColorName(todo({ value }))).toBe(expected)
  })

  it('rewards are always purple regardless of value', () => {
    const reward: RewardTask = {
      id: 'r1',
      _id: 'r1',
      type: 'reward',
      text: 'coffee',
      notes: '',
      tags: [],
      value: 999,
      priority: 1,
      attribute: 'str',
      challenge: {},
      group: {},
      reminders: [],
      createdAt: '',
      updatedAt: '',
    }
    expect(getTaskColorName(reward)).toBe('purple')
  })

  it('byHabitica tasks are always purple regardless of value', () => {
    expect(getTaskColorName(todo({ value: -50, byHabitica: true }))).toBe('purple')
  })
})
