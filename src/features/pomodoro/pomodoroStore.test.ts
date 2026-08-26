import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import { IDLE_RUN_STATE, defaultPomodoroSettings } from './pomodoroEngine'
import { autoLinkedTasks, usePomodoroStore } from './pomodoroStore'

/**
 * Integration coverage for the seam the pure modules can't reach on their
 * own: the store wiring pause/resume segments into attribution against the
 * *live* timeline store at phase-completion time. Everything below drives
 * the real stores through their public actions with a controlled clock.
 */

/** Local wall-clock instant on 2026-08-25 — timeline entries are local by
 * construction, so the fake clock has to be set in local time too. */
function localAt(hours: number, minutes = 0, seconds = 0): Date {
  return new Date(2026, 7, 25, hours, minutes, seconds, 0)
}

const DATE = '2026-08-25'

function schedule(taskId: string, startHour: number, startMinute: number, durationMinutes: number, tagIds: string[]) {
  useTimelineEntryStore.getState().addEntry(taskId, DATE, startHour * 60 + startMinute, durationMinutes, {
    text: `Task ${taskId}`,
    type: 'todo',
    tagIds,
  })
}

/** taskId -> minutes for the single logged session. */
function loggedAttribution(): Record<string, number> {
  const { history } = usePomodoroStore.getState()
  expect(history).toHaveLength(1)
  return Object.fromEntries(history[0].attribution.map((a) => [a.taskId ?? '', a.minutes]))
}

beforeEach(() => {
  vi.useFakeTimers()
  usePomodoroStore.setState({ settings: defaultPomodoroSettings(), run: IDLE_RUN_STATE, history: [] })
  useTimelineEntryStore.setState({ entries: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a focus phase that runs straight through', () => {
  it('splits its minutes across the blocks that covered it', () => {
    schedule('school', 9, 0, 10, ['tag-school'])
    schedule('work', 9, 10, 15, ['tag-work'])

    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])

    vi.setSystemTime(localAt(9, 25))
    const completed = usePomodoroStore.getState().advance()

    expect(completed?.phase).toBe('work')
    expect(loggedAttribution()).toEqual({ school: 10, work: 15 })
    // Parked at the seam, not rolled into the break.
    expect(usePomodoroStore.getState().run.status).toBe('awaiting')
    expect(usePomodoroStore.getState().run.phase).toBe('shortBreak')
  })
})

describe('a focus phase paused and resumed later', () => {
  it('ignores the wall-clock time the timer was not running', () => {
    // Blocks laid out across the whole 9:00–10:00 hour; the timer only runs
    // for 9:00–9:10 and 9:30–9:45, so only those blocks earn anything.
    schedule('early', 9, 0, 10, ['tag-a'])
    schedule('during-pause', 9, 10, 20, ['tag-b'])
    schedule('late', 9, 30, 15, ['tag-c'])

    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])

    vi.setSystemTime(localAt(9, 10))
    usePomodoroStore.getState().pauseSession()

    vi.setSystemTime(localAt(9, 30))
    usePomodoroStore.getState().resumeSession()

    // 10 banked + 15 more = the full 25-minute phase, ending at 9:45.
    vi.setSystemTime(localAt(9, 45))
    const completed = usePomodoroStore.getState().advance()

    expect(completed?.endedAt).toBe(localAt(9, 45).toISOString())
    expect(loggedAttribution()).toEqual({ early: 10, late: 15 })
  })

  it('detects the completion late without changing what was attributed', () => {
    // Same run, but the tab was buried and advance() only fires hours later.
    schedule('early', 9, 0, 10, ['tag-a'])
    schedule('late', 9, 30, 15, ['tag-c'])
    schedule('after-the-fact', 12, 0, 60, ['tag-d'])

    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])
    vi.setSystemTime(localAt(9, 10))
    usePomodoroStore.getState().pauseSession()
    vi.setSystemTime(localAt(9, 30))
    usePomodoroStore.getState().resumeSession()

    vi.setSystemTime(localAt(14, 0)) // noticed five hours later
    usePomodoroStore.getState().advance()

    // The phase still ended at 9:45, so the afternoon block earns nothing.
    expect(loggedAttribution()).toEqual({ early: 10, late: 15 })
  })
})

describe('blocks rearranged mid-session', () => {
  it('credits the arrangement that exists when the phase ends, not when it started', () => {
    schedule('school', 9, 0, 25, ['tag-school'])
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])

    // Halfway through, the School block is dragged to the afternoon and a
    // Work block takes the whole window instead.
    const schoolEntry = useTimelineEntryStore.getState().entries[0]
    vi.setSystemTime(localAt(9, 12))
    useTimelineEntryStore.getState().moveEntry(schoolEntry.id, 15 * 60)
    schedule('work', 9, 0, 25, ['tag-work'])

    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()

    expect(loggedAttribution()).toEqual({ work: 25 })
  })
})

describe('focus time no block covers', () => {
  it('falls back to the linked chips', () => {
    schedule('work', 9, 10, 15, ['tag-work'])
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([{ id: 'essay', text: 'Essay', tagIds: ['tag-school'] }])

    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()

    expect(loggedAttribution()).toEqual({ essay: 10, work: 15 })
  })

  it('logs it as uncategorized when nothing is linked or scheduled', () => {
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])
    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()

    expect(loggedAttribution()).toEqual({ '': 25 })
  })
})

describe('manual stop', () => {
  it('logs the real elapsed minutes, attributed the same way', () => {
    schedule('work', 9, 0, 60, ['tag-work'])
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])

    vi.setSystemTime(localAt(9, 12))
    usePomodoroStore.getState().stopSession()

    const { history, run } = usePomodoroStore.getState()
    expect(history[0].durationMinutes).toBe(12)
    expect(history[0].completedNaturally).toBe(false)
    expect(loggedAttribution()).toEqual({ work: 12 })
    expect(run).toEqual(IDLE_RUN_STATE)
  })

  it('discards a sub-minute session rather than logging noise', () => {
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])
    vi.setSystemTime(localAt(9, 0, 30))
    usePomodoroStore.getState().stopSession()
    expect(usePomodoroStore.getState().history).toEqual([])
  })
})

describe('the phase seam', () => {
  it('does not run the break clock until the user starts it', () => {
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])
    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()

    // An hour of ignoring the seam does not consume the break.
    vi.setSystemTime(localAt(10, 25))
    expect(usePomodoroStore.getState().advance()).toBeNull()
    expect(usePomodoroStore.getState().run.status).toBe('awaiting')

    usePomodoroStore.getState().startNextPhase()
    expect(usePomodoroStore.getState().run.status).toBe('running')
    expect(usePomodoroStore.getState().run.runningStartedAt).toBe(localAt(10, 25).toISOString())
  })

  it('logs nothing extra when a break finishes, and returns to focus', () => {
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])
    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance() // work done -> awaiting shortBreak
    usePomodoroStore.getState().startNextPhase()
    vi.setSystemTime(localAt(9, 30))
    usePomodoroStore.getState().advance() // break done -> awaiting work

    expect(usePomodoroStore.getState().history).toHaveLength(1) // the break isn't focus time
    expect(usePomodoroStore.getState().run.phase).toBe('work')
    expect(usePomodoroStore.getState().run.status).toBe('awaiting')
  })

  it('ending the session at the seam logs nothing and goes idle', () => {
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])
    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()

    vi.setSystemTime(localAt(9, 40))
    usePomodoroStore.getState().stopSession()
    expect(usePomodoroStore.getState().history).toHaveLength(1) // just the focus phase
    expect(usePomodoroStore.getState().run).toEqual(IDLE_RUN_STATE)
  })
})

describe('auto-linked tasks are re-derived at every focus phase', () => {
  /** Schedule with an explicit completion flag on the snapshot. */
  function scheduleWithState(
    taskId: string,
    startHour: number,
    durationMinutes: number,
    tagIds: string[],
    completed: boolean,
  ) {
    useTimelineEntryStore
      .getState()
      .addEntry(taskId, DATE, startHour * 60, durationMinutes, {
        text: `Task ${taskId}`,
        type: 'todo',
        tagIds,
        completed,
      })
  }

  it('drops a task finished mid-session in favour of the live one scheduled after it', () => {
    // The reported bug, start to finish: a sprint-5 block runs 9:00–11:00 and
    // a focus session auto-links it. It gets finished early and ticked off,
    // and sprint 6 is created and scheduled live at 10:00. The next focus
    // phase must link sprint 6, not the completed sprint 5.
    scheduleWithState('sprint5', 9, 120, ['tag-work'], false)

    vi.setSystemTime(localAt(9, 30))
    usePomodoroStore.getState().startSession(autoLinkedTasks(localAt(9, 30), 25))
    expect(usePomodoroStore.getState().run.tasks.map((t) => t.id)).toEqual(['sprint5'])

    // Finished early and ticked off — the snapshot sync marks the block done,
    // and the block itself deliberately stays on the timeline.
    useTimelineEntryStore
      .getState()
      .syncSnapshots(
        new Map([['sprint5', { text: 'Task sprint5', type: 'todo', tagIds: ['tag-work'], completed: true }]]),
      )
    scheduleWithState('sprint6', 10, 60, ['tag-work'], false)

    // Focus phase ends, break taken, next focus phase begins.
    vi.setSystemTime(localAt(9, 55))
    usePomodoroStore.getState().advance()
    usePomodoroStore.getState().startNextPhase() // the break
    vi.setSystemTime(localAt(10, 0))
    usePomodoroStore.getState().advance()
    usePomodoroStore.getState().startNextPhase() // the next focus phase

    expect(usePomodoroStore.getState().run.tasks.map((t) => t.id)).toEqual(['sprint6'])
  })

  it('leaves a hand-picked set alone across phases', () => {
    scheduleWithState('scheduled', 9, 120, [], false)
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([{ id: 'chosen', text: 'Chosen', tagIds: [] }], true)

    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()
    usePomodoroStore.getState().startNextPhase()
    vi.setSystemTime(localAt(9, 30))
    usePomodoroStore.getState().advance()
    usePomodoroStore.getState().startNextPhase()

    expect(usePomodoroStore.getState().run.tasks.map((t) => t.id)).toEqual(['chosen'])
  })

  it('editing the chips mid-session pins them', () => {
    scheduleWithState('scheduled', 9, 120, [], false)
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession(autoLinkedTasks(localAt(9, 0), 25))
    expect(usePomodoroStore.getState().run.tasksPinned).toBe(false)

    usePomodoroStore.getState().setSessionTasks([{ id: 'manual', text: 'Manual', tagIds: [] }])
    expect(usePomodoroStore.getState().run.tasksPinned).toBe(true)

    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()
    usePomodoroStore.getState().startNextPhase()
    vi.setSystemTime(localAt(9, 30))
    usePomodoroStore.getState().advance()
    usePomodoroStore.getState().startNextPhase()

    expect(usePomodoroStore.getState().run.tasks.map((t) => t.id)).toEqual(['manual'])
  })

  it('a break phase never re-derives — only focus phases do', () => {
    scheduleWithState('a', 9, 60, [], false)
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession(autoLinkedTasks(localAt(9, 0), 25))
    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()

    scheduleWithState('b', 9, 60, [], false) // appears during the seam
    usePomodoroStore.getState().startNextPhase() // the break
    expect(usePomodoroStore.getState().run.tasks.map((t) => t.id)).toEqual(['a'])
  })

  it('still attributes a completed task the time it was worked on before the tick', () => {
    // Excluding finished blocks from *selection* must not retroactively erase
    // the focus time they earned — attribution reads the timeline, not the
    // completion flag. Sprint 5 is scheduled 9:00–10:00 and ticked off at
    // 9:15, so it keeps the first quarter hour of the phase.
    useTimelineEntryStore.getState().addEntry('sprint5', DATE, 9 * 60, 60, {
      text: 'Task sprint5',
      type: 'todo',
      tagIds: ['tag-work'],
      completed: true,
      completedAt: localAt(9, 15).toISOString(),
    })
    vi.setSystemTime(localAt(9, 0))
    usePomodoroStore.getState().startSession([])
    vi.setSystemTime(localAt(9, 25))
    usePomodoroStore.getState().advance()

    // 15 minutes to sprint 5, and the 10 minutes after the tick fall through
    // to uncategorized rather than being credited to finished work.
    expect(loggedAttribution()).toEqual({ sprint5: 15, '': 10 })
  })

  it('hands the rest of a finished block\'s window to whatever replaced it', () => {
    // The full report: sprint 5 booked 9:00–11:00, done at 10:00; sprint 6
    // created and scheduled over the remainder; the focus phase from 10:00
    // belongs entirely to sprint 6.
    useTimelineEntryStore.getState().addEntry('sprint5', DATE, 9 * 60, 120, {
      text: 'Task sprint5',
      type: 'todo',
      tagIds: ['tag-work'],
      completed: true,
      completedAt: localAt(10, 0).toISOString(),
    })
    scheduleWithState('sprint6', 10, 60, ['tag-work'], false)

    vi.setSystemTime(localAt(10, 0))
    usePomodoroStore.getState().startSession(autoLinkedTasks(localAt(10, 0), 25))
    vi.setSystemTime(localAt(10, 25))
    usePomodoroStore.getState().advance()

    expect(loggedAttribution()).toEqual({ sprint6: 25 })
  })
})
