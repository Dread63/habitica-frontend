import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import {
  entryDurationMs,
  findOverlaps,
  openEntryOf,
  totalDurationMs,
  type TimeEntryState,
} from '@/features/tracking/timeEntries'
import { IDLE_RUN_STATE, defaultPomodoroSettings } from './pomodoroEngine'
import { completedPomodoros, phaseActualMs, workPhases } from './pomodoroPhases'
import { migratePomodoroState, suggestedTaskRef, usePomodoroStore } from './pomodoroStore'
import { entriesNeedingReview, resolveReconcileChoice } from '@/features/tracking/reconciliation'

/**
 * Integration coverage for the seam the pure modules can't reach: the
 * pomodoro store driving the time-entry ledger and the phase log together,
 * against a controlled clock.
 *
 * Most of these are named regressions for bugs in the *previous* model, where
 * time was reconstructed at phase end by overlaying the timeline onto the
 * clock. Each one asserts the property that replaced it: a minute, once
 * elapsed, belongs to whoever owned it at the time.
 */

/** Local wall-clock on 2026-08-27 — timeline entries are local by construction. */
const localAt = (h: number, m = 0, s = 0) => new Date(2026, 7, 27, h, m, s, 0)
const DATE = '2026-08-27'

const pomodoro = () => usePomodoroStore.getState()
const ledger = () => useTimeEntryStore.getState()
const timeline = () => useTimelineEntryStore.getState()

const ref = (id: string, tagIds: string[] = []) => ({ id, text: `Task ${id}`, type: 'todo' as const, tagIds })

function schedule(taskId: string, startHour: number, durationMinutes: number, tagIds: string[] = []) {
  timeline().addEntry(taskId, DATE, startHour * 60, durationMinutes, {
    text: `Task ${taskId}`,
    type: 'todo',
    tagIds,
    completed: false,
  })
}

/** [taskId, minutes] per recorded interval, in order. */
function log(now: Date): [string, number][] {
  return ledger().entries.map((e) => [e.taskId, Math.round(entryDurationMs(e, now) / 60_000)])
}

const trackedMs = (now: Date) => totalDurationMs(ledger().entries, now)

beforeEach(() => {
  vi.useFakeTimers()
  usePomodoroStore.setState({ settings: defaultPomodoroSettings(), run: IDLE_RUN_STATE, phases: [] })
  useTimeEntryStore.setState({ entries: [], tombstones: {} } satisfies TimeEntryState)
  useTimelineEntryStore.setState({ entries: [], tombstones: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a focus phase records what was actually worked on', () => {
  it('records one interval for a straight-through phase, and logs the phase separately', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('report', ['tag-work']))
    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()

    const [phase] = pomodoro().phases
    expect(phase.phase).toBe('work')
    expect(phaseActualMs(phase)).toBe(25 * 60_000)
    // The pointer keeps running past the bell — see the overrun test below.
    expect(openEntryOf(ledger().entries)?.taskId).toBe('report')
    expect(trackedMs(localAt(9, 25))).toBe(25 * 60_000)
    expect(ledger().entries[0].phaseId).toBe(phase.id)
  })

  it('keeps tracking past the bell, so overrun is not silently lost', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('report'))
    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()

    // Six more minutes finishing a thought before starting the break.
    vi.setSystemTime(localAt(9, 31))
    pomodoro().startNextPhase()

    // The phase says 25; the entry says 31. Both are true.
    expect(phaseActualMs(pomodoro().phases[0])).toBe(25 * 60_000)
    expect(trackedMs(localAt(9, 40))).toBe(31 * 60_000)
    expect(openEntryOf(ledger().entries)).toBeUndefined()
  })

  it('records a break as a phase but tracks no time against it', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('a'))
    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()
    pomodoro().startNextPhase() // break begins
    vi.setSystemTime(localAt(9, 30))
    pomodoro().advance()

    expect(pomodoro().phases.map((p) => p.phase)).toEqual(['work', 'shortBreak'])
    expect(workPhases(pomodoro().phases)).toHaveLength(1)
    expect(trackedMs(localAt(9, 30))).toBe(25 * 60_000) // unchanged by the break
  })
})

describe('regressions: edits can no longer rewrite elapsed time', () => {
  it('moving a timeline block mid-phase does not change a single recorded minute', () => {
    // Previously the whole phase was re-attributed against the final layout.
    schedule('school', 9, 60)
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('school'))

    vi.setSystemTime(localAt(9, 12))
    timeline().moveEntry(timeline().entries[0].id, 15 * 60) // dragged to the afternoon

    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()
    pomodoro().startNextPhase()

    expect(log(localAt(9, 25))).toEqual([['school', 25]])
  })

  it('deleting a timeline block mid-phase does not change what was recorded', () => {
    schedule('school', 9, 60)
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('school'))

    vi.setSystemTime(localAt(9, 12))
    timeline().removeEntry(timeline().entries[0].id)

    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()
    pomodoro().startNextPhase()

    expect(log(localAt(9, 25))).toEqual([['school', 25]])
  })

  it('overlapping timeline blocks never split a minute — the pointer owns it', () => {
    // Previously two overlapping blocks split the time 50/50, a guess.
    schedule('a', 9, 60)
    schedule('b', 9, 60)
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('a'))
    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()
    pomodoro().startNextPhase()

    expect(log(localAt(9, 25))).toEqual([['a', 25]])
  })

  it('switching task mid-phase splits at the switch, not evenly', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('essay'))
    vi.setSystemTime(localAt(9, 10))
    ledger().start(ref('report'))
    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()
    pomodoro().startNextPhase()

    expect(log(localAt(9, 25))).toEqual([
      ['essay', 10],
      ['report', 15],
    ])
  })

  it('every recorded minute has exactly one owner', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('a'))
    for (const [m, id] of [
      [8, 'b'],
      [14, 'c'],
      [20, 'd'],
    ] as const) {
      vi.setSystemTime(localAt(9, m))
      ledger().start(ref(id))
    }
    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()
    pomodoro().startNextPhase()

    expect(trackedMs(localAt(9, 25))).toBe(25 * 60_000)
    expect(findOverlaps(ledger().entries, localAt(9, 25))).toEqual([])
  })
})

describe('pauses and absence', () => {
  it('pausing at 9:10 and resuming at 9:30 records two intervals, not one 45-minute one', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('a'))
    vi.setSystemTime(localAt(9, 10))
    pomodoro().pauseSession()
    vi.setSystemTime(localAt(9, 30))
    pomodoro().resumeSession()
    vi.setSystemTime(localAt(9, 45))
    pomodoro().advance()

    expect(ledger().entries).toHaveLength(2)
    expect(trackedMs(localAt(9, 45))).toBe(25 * 60_000) // the 20-minute pause is not time spent
    expect(phaseActualMs(pomodoro().phases[0])).toBe(25 * 60_000)
  })

  it('resuming reopens the pointer on the same task', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('a'))
    vi.setSystemTime(localAt(9, 10))
    pomodoro().pauseSession()
    vi.setSystemTime(localAt(9, 30))
    pomodoro().resumeSession()

    expect(openEntryOf(ledger().entries)?.taskId).toBe('a')
  })

  it('a phase detected five hours late still ends at the phase-end instant', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('a'))
    vi.setSystemTime(localAt(14)) // tab was buried
    pomodoro().advance()

    expect(pomodoro().phases[0].endedAt).toBe(localAt(9, 25).toISOString())
    expect(phaseActualMs(pomodoro().phases[0])).toBe(25 * 60_000)
  })
})

describe('task lifecycle while tracking', () => {
  it('deleting the tracked task stops the pointer and KEEPS the minutes', () => {
    // Deliberately opposite to the timeline cascade: deleting a task must not
    // erase the record of time spent on it.
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('doomed'))
    vi.setSystemTime(localAt(9, 18))
    ledger().onTaskDeleted('doomed')

    expect(openEntryOf(ledger().entries)).toBeUndefined()
    expect(log(localAt(9, 18))).toEqual([['doomed', 18]])
  })

  it('a manual stop records a partial phase and closes the interval together', () => {
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('a'))
    vi.setSystemTime(localAt(9, 12))
    pomodoro().stopSession()

    const [phase] = pomodoro().phases
    expect(phase.completedNaturally).toBe(false)
    expect(phaseActualMs(phase)).toBe(12 * 60_000)
    expect(completedPomodoros(pomodoro().phases)).toHaveLength(0)
    expect(openEntryOf(ledger().entries)).toBeUndefined()
    expect(trackedMs(localAt(9, 20))).toBe(12 * 60_000)
  })
})

describe('the pointer follows the timeline when nothing is tracked', () => {
  it('suggests the block that is live right now', () => {
    schedule('live-now', 9, 60, ['tag-work'])
    expect(suggestedTaskRef(localAt(9, 30), 25)?.id).toBe('live-now')
  })

  it('skips a completed block', () => {
    timeline().addEntry('done', DATE, 9 * 60, 120, {
      text: 'Task done',
      type: 'todo',
      tagIds: [],
      completed: true,
    })
    schedule('next-up', 10, 60)
    expect(suggestedTaskRef(localAt(9, 45), 25)?.id).toBe('next-up')
  })

  it('a new focus phase re-infers rather than reusing a stale choice', () => {
    schedule('sprint-6', 10, 60)
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('sprint-5'))
    vi.setSystemTime(localAt(9, 25))
    pomodoro().advance()
    pomodoro().startNextPhase() // break — closes the pointer
    vi.setSystemTime(localAt(10, 0))
    pomodoro().advance()
    pomodoro().startNextPhase() // next focus phase

    expect(openEntryOf(ledger().entries)?.taskId).toBe('sprint-6')
  })
})

describe('migratePomodoroState', () => {
  it('preserves the hand-curated tracked tags — the thing it exists for', () => {
    const result = migratePomodoroState(
      { settings: { workMinutes: 50, trackedTagIds: ['tag-work', 'tag-school'] }, settingsUpdatedAt: 42 },
      5,
    )
    expect(result.settings.trackedTagIds).toEqual(['tag-work', 'tag-school'])
    expect(result.settings.workMinutes).toBe(50)
    expect(result.settingsUpdatedAt).toBe(42)
  })

  it('drops attribution-era history rather than inventing intervals for it', () => {
    const result = migratePomodoroState(
      { settings: {}, history: [{ id: 's1', durationMinutes: 25, tasks: [], attribution: [] }] },
      5,
    ) as unknown as Record<string, unknown>
    expect(result.phases).toEqual([])
    expect(result).not.toHaveProperty('history')
  })

  it('resets a mid-flight run and defaults an absent or unknown payload', () => {
    expect(migratePomodoroState({ run: { status: 'running' } }, 5).run).toEqual(IDLE_RUN_STATE)
    expect(migratePomodoroState(undefined, 0).settings).toEqual(defaultPomodoroSettings())
  })
})

describe('regression: closing the laptop mid-phase', () => {
  it('records the phase, but the entry is flagged for review rather than counted whole', () => {
    // The old model logged a full 25-minute focus session for a laptop that
    // was shut ten minutes in. Now the phase record still says the timer ran
    // — that's a fact about a machine — but the entry carrying the *minutes*
    // is offered for reconciliation, and the two legitimately disagree.
    vi.setSystemTime(localAt(9))
    pomodoro().startSession(ref('report'))

    // Device goes quiet at 9:10; three hours later the tab wakes up.
    const lastSeenAt = localAt(9, 10).getTime()
    vi.setSystemTime(localAt(12))
    pomodoro().advance()

    expect(phaseActualMs(pomodoro().phases[0])).toBe(25 * 60_000)
    const flagged = entriesNeedingReview(ledger().entries, lastSeenAt, localAt(12))
    expect(flagged).toHaveLength(1)

    // Accepting the proposal trims it to the ten minutes actually witnessed.
    const resolved = resolveReconcileChoice(flagged[0], { kind: 'keepUntilLastSeen' }, lastSeenAt, localAt(12))
    expect(resolved).toEqual({ endedAt: localAt(9, 10).toISOString() })
  })
})
