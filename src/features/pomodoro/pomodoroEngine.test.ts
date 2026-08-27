import { describe, expect, it } from 'vitest'
import {
  advancePhase,
  closeSegments,
  defaultPomodoroSettings,
  elapsedMs,
  IDLE_RUN_STATE,
  nextPhase,
  remainingMs,
  segmentsMs,
  type PomodoroRunState,
} from './pomodoroEngine'

const settings = defaultPomodoroSettings() // 25/5/15, long break every 4

function runningState(overrides: Partial<PomodoroRunState> = {}): PomodoroRunState {
  return {
    ...IDLE_RUN_STATE,
    status: 'running',
    phase: 'work',
    runningStartedAt: '2026-08-25T09:00:00.000Z',
    ...overrides,
  }
}

/** A closed segment of `minutes`, ending just before the running anchor. */
function bankedSegment(minutes: number, endedAt = '2026-08-25T08:59:00.000Z') {
  return { startedAt: new Date(new Date(endedAt).getTime() - minutes * 60_000).toISOString(), endedAt }
}

const at = (iso: string) => new Date(iso)

describe('nextPhase', () => {
  it('work -> short break before the cycle completes, counter advances', () => {
    expect(nextPhase('work', 0, settings)).toEqual({ phase: 'shortBreak', sessionsCompletedInCycle: 1 })
    expect(nextPhase('work', 2, settings)).toEqual({ phase: 'shortBreak', sessionsCompletedInCycle: 3 })
  })

  it('work -> long break on the last session of the cycle, counter resets', () => {
    expect(nextPhase('work', 3, settings)).toEqual({ phase: 'longBreak', sessionsCompletedInCycle: 0 })
  })

  it('either break -> work, counter untouched', () => {
    expect(nextPhase('shortBreak', 2, settings)).toEqual({ phase: 'work', sessionsCompletedInCycle: 2 })
    expect(nextPhase('longBreak', 0, settings)).toEqual({ phase: 'work', sessionsCompletedInCycle: 0 })
  })
})

describe('segmentsMs', () => {
  it('sums closed intervals', () => {
    expect(segmentsMs([])).toBe(0)
    expect(segmentsMs([bankedSegment(7), bankedSegment(3)])).toBe(10 * 60_000)
  })
})

describe('closeSegments', () => {
  it('appends the in-flight slice', () => {
    const run = runningState()
    expect(closeSegments(run, at('2026-08-25T09:10:00.000Z'))).toEqual([
      { startedAt: '2026-08-25T09:00:00.000Z', endedAt: '2026-08-25T09:10:00.000Z' },
    ])
  })

  it('leaves a non-running run alone', () => {
    const paused = runningState({ status: 'paused', runningStartedAt: null, segments: [bankedSegment(4)] })
    expect(closeSegments(paused, at('2026-08-25T10:00:00.000Z'))).toBe(paused.segments)
  })

  it('drops a zero-or-backwards slice rather than recording it', () => {
    const run = runningState()
    expect(closeSegments(run, at('2026-08-25T09:00:00.000Z'))).toEqual([])
    expect(closeSegments(run, at('2026-08-25T08:59:00.000Z'))).toEqual([])
  })
})

describe('elapsedMs / remainingMs', () => {
  it('counts from the running anchor', () => {
    const run = runningState()
    expect(elapsedMs(run, at('2026-08-25T09:10:00.000Z'))).toBe(10 * 60_000)
    expect(remainingMs(run, settings, at('2026-08-25T09:10:00.000Z'))).toBe(15 * 60_000)
  })

  it('freezes exactly while paused, regardless of how far now advances', () => {
    const paused = runningState({ status: 'paused', runningStartedAt: null, segments: [bankedSegment(7)] })
    expect(remainingMs(paused, settings, at('2026-08-25T09:00:00.000Z'))).toBe(18 * 60_000)
    expect(remainingMs(paused, settings, at('2026-08-26T09:00:00.000Z'))).toBe(18 * 60_000)
  })

  it('accumulates pre-pause elapsed time after a resume', () => {
    const resumed = runningState({ segments: [bankedSegment(7)] })
    expect(elapsedMs(resumed, at('2026-08-25T09:03:00.000Z'))).toBe(10 * 60_000)
  })

  it('an awaiting run reads as a full, un-started phase', () => {
    const awaiting = runningState({ status: 'awaiting', phase: 'shortBreak', runningStartedAt: null, segments: [] })
    expect(elapsedMs(awaiting, at('2026-08-25T23:00:00.000Z'))).toBe(0)
    expect(remainingMs(awaiting, settings, at('2026-08-25T23:00:00.000Z'))).toBe(5 * 60_000)
  })
})

describe('advancePhase', () => {
  it('is a no-op while the phase is still in progress', () => {
    const run = runningState()
    const result = advancePhase(run, settings, at('2026-08-25T09:24:59.000Z'))
    expect(result.completed).toBeNull()
    expect(result.run).toBe(run)
  })

  it('never advances a paused run', () => {
    const paused = runningState({ status: 'paused', runningStartedAt: null, segments: [bankedSegment(20)] })
    expect(advancePhase(paused, settings, at('2026-09-01T00:00:00.000Z')).completed).toBeNull()
  })

  it('never advances an already-awaiting run — the seam waits for the user', () => {
    const awaiting = runningState({ status: 'awaiting', phase: 'shortBreak', runningStartedAt: null })
    expect(advancePhase(awaiting, settings, at('2026-09-01T00:00:00.000Z')).completed).toBeNull()
  })

  it('records the finished work phase and parks on the next one, stopped', () => {
    const run = runningState()
    // 27 minutes in: work (25) finished 2 minutes ago.
    const { run: next, completed } = advancePhase(run, settings, at('2026-08-25T09:27:00.000Z'))
    expect(completed).toEqual({
      id: null,
      phase: 'work',
      startedAt: '2026-08-25T09:00:00.000Z',
      endedAt: '2026-08-25T09:25:00.000Z',
      durationMinutes: 25,
      segments: [{ startedAt: '2026-08-25T09:00:00.000Z', endedAt: '2026-08-25T09:25:00.000Z' }],
    })
    expect(next.status).toBe('awaiting')
    expect(next.phase).toBe('shortBreak')
    expect(next.sessionsCompletedInCycle).toBe(1)
    expect(next.runningStartedAt).toBeNull()
    // The 2 overflow minutes are NOT silently spent on the break — the break
    // hasn't started, so it still has its full 5 minutes.
    expect(remainingMs(next, settings, at('2026-08-25T09:27:00.000Z'))).toBe(5 * 60_000)
  })

  it('accounts for banked (pre-pause) time when computing the end instant', () => {
    // 20 minutes already banked; only 5 more needed, so work ends at 09:05.
    const run = runningState({ segments: [bankedSegment(20)] })
    const { completed } = advancePhase(run, settings, at('2026-08-25T09:09:00.000Z'))
    expect(completed?.endedAt).toBe('2026-08-25T09:05:00.000Z')
    expect(completed?.durationMinutes).toBe(25)
  })

  it('reports the real running segments, pause gaps excluded', () => {
    // 10 minutes at 08:30, paused, resumed at 09:00 for the last 15.
    const run = runningState({
      segments: [{ startedAt: '2026-08-25T08:30:00.000Z', endedAt: '2026-08-25T08:40:00.000Z' }],
    })
    const { completed } = advancePhase(run, settings, at('2026-08-25T09:20:00.000Z'))
    expect(completed?.segments).toEqual([
      { startedAt: '2026-08-25T08:30:00.000Z', endedAt: '2026-08-25T08:40:00.000Z' },
      { startedAt: '2026-08-25T09:00:00.000Z', endedAt: '2026-08-25T09:15:00.000Z' },
    ])
    // The recorded window spans the pause, but only 25 real minutes elapsed.
    expect(completed?.startedAt).toBe('2026-08-25T08:30:00.000Z')
    expect(completed?.durationMinutes).toBe(25)
  })

  it('advances at most one phase even after hours away — no imaginary sessions', () => {
    const run = runningState()
    const { run: next, completed } = advancePhase(run, settings, at('2026-08-25T12:00:00.000Z')) // 3h later
    expect(completed?.phase).toBe('work')
    expect(completed?.endedAt).toBe('2026-08-25T09:25:00.000Z')
    expect(next.status).toBe('awaiting')
    // Calling again changes nothing: the run is parked until the user starts it.
    expect(advancePhase(next, settings, at('2026-08-25T18:00:00.000Z')).completed).toBeNull()
  })

  it('sends the fourth work session to a long break and resets the cycle counter', () => {
    const run = runningState({ sessionsCompletedInCycle: 3 })
    const { run: next } = advancePhase(run, settings, at('2026-08-25T09:25:00.000Z'))
    expect(next.phase).toBe('longBreak')
    expect(next.sessionsCompletedInCycle).toBe(0)
  })

  it('a finished break parks on work, and is not itself focus time', () => {
    const run = runningState({ phase: 'shortBreak', sessionsCompletedInCycle: 1 })
    const { run: next, completed } = advancePhase(run, settings, at('2026-08-25T09:06:00.000Z'))
    expect(completed?.phase).toBe('shortBreak')
    expect(next.phase).toBe('work')
    expect(next.status).toBe('awaiting')
  })
})
