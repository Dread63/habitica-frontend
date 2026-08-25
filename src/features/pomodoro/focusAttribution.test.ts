import { describe, expect, it } from 'vitest'
import { createTimelineEntry, type TimelineEntry } from '@/features/timeline/timelineEntries'
import { hhmmToMinutes } from '@/lib/timeOfDay'
import { attributeFocusTime } from './focusAttribution'
import type { FocusSegment, PomodoroTaskRef } from './pomodoroEngine'

const DATE = '2026-08-25'

/** A local-time instant on DATE — every assertion here compares against
 * timeline entries, which are local-calendar by construction, so segments
 * have to be built the same way to hold in any timezone. */
function localAt(hhmm: string): Date {
  const minutes = hhmmToMinutes(hhmm)!
  const d = new Date(2026, 7, 25)
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d
}

function segment(startHHmm: string, endHHmm: string): FocusSegment {
  return { startedAt: localAt(startHHmm).toISOString(), endedAt: localAt(endHHmm).toISOString() }
}

function entry(
  taskId: string,
  startHHmm: string,
  durationMinutes: number,
  tagIds: string[] = [],
  date = DATE,
): TimelineEntry {
  return createTimelineEntry(
    {
      taskId,
      date,
      startMinutes: hhmmToMinutes(startHHmm)!,
      durationMinutes,
      taskSnapshot: { text: `Task ${taskId}`, type: 'todo', tagIds },
    },
    `entry-${taskId}-${startHHmm}`,
    '2026-08-25T00:00:00.000Z',
  )
}

function chip(id: string, tagIds: string[] = []): PomodoroTaskRef {
  return { id, text: `Task ${id}`, tagIds }
}

/** minutes keyed by taskId ('' for uncategorized) — the shape assertions read best in. */
function minutesByTask(result: ReturnType<typeof attributeFocusTime>): Record<string, number> {
  return Object.fromEntries(result.map((a) => [a.taskId ?? '', a.minutes]))
}

describe('attributeFocusTime', () => {
  it('splits one focus phase across the timeline blocks that covered it', () => {
    // The motivating case: 25 minutes of focus, first 10 on a School task,
    // the next 15 on a Work task.
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:25')],
      entries: [entry('school', '09:00', 10, ['tag-school']), entry('work', '09:10', 15, ['tag-work'])],
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ school: 10, work: 15 })
  })

  it('uses the timeline as it stands now — a block dragged out of the window earns nothing', () => {
    // Same phase, but the School block was moved to the afternoon before the
    // phase ended. Only what's actually over the focus window counts.
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:25')],
      entries: [entry('school', '14:00', 10, ['tag-school']), entry('work', '09:00', 25, ['tag-work'])],
      linkedTasks: [chip('school', ['tag-school']), chip('work', ['tag-work'])],
    })
    expect(minutesByTask(result)).toEqual({ work: 25 })
  })

  it('excludes paused wall-clock time — the timeline keeps moving, the timer does not', () => {
    // Ran 09:00–09:10, paused until 09:30, ran 09:30–09:45. A block sitting
    // squarely in the pause gap must earn nothing.
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:10'), segment('09:30', '09:45')],
      entries: [
        entry('a', '09:00', 10, ['tag-a']),
        entry('paused-over', '09:10', 20, ['tag-b']),
        entry('c', '09:30', 15, ['tag-c']),
      ],
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ a: 10, c: 15 })
  })

  it('falls back to the linked chips for time no block covers, split evenly', () => {
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:25')],
      entries: [entry('work', '09:10', 15, ['tag-work'])],
      linkedTasks: [chip('essay', ['tag-school']), chip('reading', ['tag-school'])],
    })
    // 09:00–09:10 uncovered -> 5 min each chip; 09:10–09:25 -> the block.
    expect(minutesByTask(result)).toEqual({ essay: 5, reading: 5, work: 15 })
  })

  it('logs uncovered time as uncategorized when nothing is linked either', () => {
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:25')],
      entries: [],
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ '': 25 })
    expect(result[0].taskId).toBeNull()
    expect(result[0].text).toBe('Uncategorized')
  })

  it('splits overlapping blocks evenly so the total stays honest', () => {
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:20')],
      entries: [entry('a', '09:00', 20, ['tag-a']), entry('b', '09:00', 20, ['tag-b'])],
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ a: 10, b: 10 })
  })

  it('conserves total time across a mixed covered/overlapping/uncovered phase', () => {
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:30')],
      entries: [entry('a', '09:00', 10), entry('b', '09:05', 15), entry('c', '09:20', 5)],
      linkedTasks: [chip('fallback')],
    })
    const total = result.reduce((sum, a) => sum + a.minutes, 0)
    expect(total).toBeCloseTo(30, 5)
  })

  it('clips a block that only partly overlaps the phase', () => {
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:20')],
      entries: [entry('long', '08:30', 60, ['tag-a'])], // 08:30–09:30
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ long: 20 })
  })

  it('ignores blocks on other days', () => {
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:20')],
      entries: [entry('yesterday', '09:00', 20, ['tag-a'], '2026-08-24')],
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ '': 20 })
  })

  it('prefers a live linked ref over the entry snapshot for name and tags', () => {
    const stale = entry('t', '09:00', 20, ['old-tag'])
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:20')],
      entries: [stale],
      linkedTasks: [{ id: 't', text: 'Renamed', tagIds: ['new-tag'] }],
    })
    expect(result).toEqual([{ taskId: 't', text: 'Renamed', tagIds: ['new-tag'], minutes: 20 }])
  })

  it('still attributes time for a snapshot-less (pre-v2) entry, just unnamed', () => {
    const bare: TimelineEntry = {
      id: 'e1',
      taskId: 'ghost',
      date: DATE,
      startMinutes: hhmmToMinutes('09:00')!,
      durationMinutes: 20,
      createdAt: '2026-08-25T00:00:00.000Z',
    }
    const result = attributeFocusTime({ segments: [segment('09:00', '09:20')], entries: [bare], linkedTasks: [] })
    expect(result).toEqual([{ taskId: 'ghost', text: 'Unknown task', tagIds: [], minutes: 20 }])
  })

  it('returns nothing for an empty or zero-length phase', () => {
    expect(attributeFocusTime({ segments: [], entries: [], linkedTasks: [] })).toEqual([])
    expect(
      attributeFocusTime({ segments: [segment('09:00', '09:00')], entries: [], linkedTasks: [chip('a')] }),
    ).toEqual([])
  })

  it('sorts biggest contributor first', () => {
    const result = attributeFocusTime({
      segments: [segment('09:00', '09:30')],
      entries: [entry('small', '09:00', 5), entry('big', '09:05', 25)],
      linkedTasks: [],
    })
    expect(result.map((a) => a.taskId)).toEqual(['big', 'small'])
  })
})

describe('a block whose task gets completed mid-window', () => {
  /** An entry whose task was completed at the given local time. */
  function completedEntry(taskId: string, startHHmm: string, durationMinutes: number, completedHHmm: string) {
    return createTimelineEntry(
      {
        taskId,
        date: DATE,
        startMinutes: hhmmToMinutes(startHHmm)!,
        durationMinutes,
        taskSnapshot: {
          text: `Task ${taskId}`,
          type: 'todo',
          tagIds: [],
          completed: true,
          completedAt: localAt(completedHHmm).toISOString(),
        },
      },
      `entry-${taskId}`,
      '2026-08-25T00:00:00.000Z',
    )
  }

  it('stops absorbing time at the moment it was ticked off', () => {
    // The report: sprint 5 is scheduled 9:00–11:00 but finished at 10:00, and
    // sprint 6 takes over the rest of the window. Focus from 10:00 belongs to
    // sprint 6 — sprint 5 must not keep collecting just because its block is
    // still drawn across the hour.
    const result = attributeFocusTime({
      segments: [segment('10:00', '10:25')],
      entries: [completedEntry('sprint5', '09:00', 120, '10:00'), entry('sprint6', '10:00', 60)],
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ sprint6: 25 })
  })

  it('keeps the time it genuinely absorbed before the tick', () => {
    // Same block, but the focus phase straddles the completion: ten minutes
    // really were spent on sprint 5, and erasing those was never the goal.
    const result = attributeFocusTime({
      segments: [segment('09:50', '10:15')],
      entries: [completedEntry('sprint5', '09:00', 120, '10:00'), entry('sprint6', '10:00', 60)],
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ sprint5: 10, sprint6: 15 })
  })

  it('falls back to the chips once the completed block stops covering', () => {
    const result = attributeFocusTime({
      segments: [segment('10:00', '10:20')],
      entries: [completedEntry('sprint5', '09:00', 120, '10:00')],
      linkedTasks: [chip('other')],
    })
    expect(minutesByTask(result)).toEqual({ other: 20 })
  })

  it('contributes nothing when it was completed before its block even started', () => {
    const result = attributeFocusTime({
      segments: [segment('10:00', '10:20')],
      entries: [completedEntry('stale', '10:00', 60, '09:00')],
      linkedTasks: [],
    })
    expect(minutesByTask(result)).toEqual({ '': 20 })
  })

  it('keeps whole-window behavior when the completion instant is unknown', () => {
    // Snapshots written before completedAt was recorded: counting the block
    // in full is the old behavior, and the next snapshot sync corrects it.
    const legacy = createTimelineEntry(
      {
        taskId: 'legacy',
        date: DATE,
        startMinutes: hhmmToMinutes('09:00')!,
        durationMinutes: 120,
        taskSnapshot: { text: 'Legacy', type: 'todo', tagIds: [], completed: true },
      },
      'entry-legacy',
      '2026-08-25T00:00:00.000Z',
    )
    const result = attributeFocusTime({ segments: [segment('10:00', '10:20')], entries: [legacy], linkedTasks: [] })
    expect(minutesByTask(result)).toEqual({ legacy: 20 })
  })
})
