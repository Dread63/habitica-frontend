import { describe, expect, it } from 'vitest'
import type { TodoTask } from '@/lib/habitica/types'
import {
  ACTIVITY_ID_PREFIX,
  activityIdOf,
  activityLabelOf,
  isActivityId,
  isActivitySubject,
  normaliseActivityLabel,
  subjectOfActivity,
  subjectOfTask,
} from './subject'

const task: TodoTask = {
  id: 'abc',
  _id: 'abc',
  type: 'todo',
  text: 'Write the report',
  notes: '',
  tags: ['tag-1', 'tag-2'],
  value: 0,
  priority: 1,
  attribute: 'str',
  challenge: {},
  group: {},
  reminders: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  checklist: [],
  collapseChecklist: false,
  completed: false,
}

describe('normaliseActivityLabel', () => {
  it('lowercases, trims and collapses internal whitespace', () => {
    expect(normaliseActivityLabel('  IT   Support  ')).toBe('it support')
  })

  it('returns empty string for a label with no content', () => {
    expect(normaliseActivityLabel('   ')).toBe('')
    expect(normaliseActivityLabel('')).toBe('')
  })
})

describe('activityIdOf', () => {
  it('derives the same id from equivalent labels', () => {
    // The whole reason ids are derived: two entries a week apart under the
    // same name must aggregate into one row in the category charts.
    expect(activityIdOf('IT Support')).toBe(activityIdOf('it  support'))
    expect(activityIdOf('IT Support')).toBe(`${ACTIVITY_ID_PREFIX}it support`)
  })

  it('derives different ids from different labels', () => {
    expect(activityIdOf('IT support')).not.toBe(activityIdOf('IT admin'))
  })

  it('returns null rather than minting a bare prefix for an empty label', () => {
    expect(activityIdOf('  ')).toBeNull()
  })
})

describe('isActivityId', () => {
  it('distinguishes activity ids from Habitica task ids', () => {
    expect(isActivityId('activity:it support')).toBe(true)
    expect(isActivityId('abc')).toBe(false)
    // A Habitica id is a UUID, so it can never collide with the prefix.
    expect(isActivityId('8f14e45f-ceea-467a-9f9b-6b1b1b1b1b1b')).toBe(false)
  })
})

describe('activityLabelOf', () => {
  it('strips the prefix', () => {
    expect(activityLabelOf('activity:it support')).toBe('it support')
  })

  it('passes a task id through untouched', () => {
    expect(activityLabelOf('abc')).toBe('abc')
  })
})

describe('subjectOfTask', () => {
  it('carries id, text, type and tags', () => {
    expect(subjectOfTask(task)).toEqual({
      id: 'abc',
      text: 'Write the report',
      type: 'todo',
      tagIds: ['tag-1', 'tag-2'],
    })
  })

  it('is not an activity subject', () => {
    expect(isActivitySubject(subjectOfTask(task))).toBe(false)
  })
})

describe('subjectOfActivity', () => {
  it('keeps the typed casing as display text but normalises the id', () => {
    const subject = subjectOfActivity('IT  Support', ['tag-1'])
    expect(subject).toEqual({ id: 'activity:it support', text: 'IT Support', tagIds: ['tag-1'] })
  })

  it('has no task type', () => {
    expect(subjectOfActivity('Standup')?.type).toBeUndefined()
  })

  it('defaults to no tags', () => {
    expect(subjectOfActivity('Standup')?.tagIds).toEqual([])
  })

  it('returns null for an empty label', () => {
    expect(subjectOfActivity('   ')).toBeNull()
  })

  it('is an activity subject', () => {
    expect(isActivitySubject(subjectOfActivity('Standup')!)).toBe(true)
  })
})
