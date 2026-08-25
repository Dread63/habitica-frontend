import { describe, expect, it } from 'vitest'
import { eligibleTasks, unscheduledTasks } from './timelineEligibility'
import type { TimelineEntry } from './timelineEntries'
import type { Task } from '@/lib/habitica/types'

// Minimal task stubs — only the fields eligibility reads.
function task(id: string, type: Task['type'], completed = false): Task {
  return { id, type, completed } as unknown as Task
}

const entry = (taskId: string, date: string): TimelineEntry => ({
  id: `e-${taskId}-${date}`,
  taskId,
  date,
  startMinutes: 540,
  durationMinutes: 30,
  createdAt: '',
})

describe('eligibleTasks', () => {
  it('always excludes rewards, includes every other type', () => {
    const tasks = [task('h', 'habit'), task('d', 'daily'), task('t', 'todo'), task('r', 'reward')]
    expect(eligibleTasks(tasks).map((t) => t.id)).toEqual(['h', 'd', 't'])
  })

  it('keeps completed tasks — the timeline is also for reviewing the day', () => {
    const tasks = [task('done', 'todo', true), task('open', 'todo', false)]
    expect(eligibleTasks(tasks)).toHaveLength(2)
  })
})

describe('unscheduledTasks', () => {
  it('excludes a task with an entry on the queried date, includes it for other dates', () => {
    const tasks = [task('a', 'todo'), task('b', 'habit')]
    const entries = [entry('a', '2026-08-25')]
    expect(unscheduledTasks(tasks, entries, '2026-08-25').map((t) => t.id)).toEqual(['b'])
    expect(unscheduledTasks(tasks, entries, '2026-08-26').map((t) => t.id)).toEqual(['a', 'b'])
  })
})
