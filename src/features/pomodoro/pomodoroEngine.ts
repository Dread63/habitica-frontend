/**
 * The pomodoro timer's pure core. The design rule that makes it correct
 * across tab backgrounding, setInterval throttling, and full page reloads:
 * the persisted truth is only ever *timestamp anchors* (`runningStartedAt` +
 * the closed `segments` of the current phase), never a live countdown
 * number. Everything shown is recomputed from those plus "now" on demand — a
 * timestamp subtraction can't drift, because nothing depends on a timer
 * callback firing on time.
 *
 * Every function takes `now` as a parameter rather than reading the clock —
 * same testability discipline as todoBuckets.ts's `bucketOf`.
 */

export type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak'
/**
 * `awaiting` is the phase seam: the previous phase ran its full length and
 * was logged, `phase` already holds the *next* one, and the clock is
 * deliberately stopped until the user presses start. The timer never rolls
 * itself into a break (or out of one) — a break you didn't notice starting
 * is a break you didn't take, and an auto-started next phase would quietly
 * record minutes you weren't there for.
 */
export type PomodoroStatus = 'idle' | 'running' | 'paused' | 'awaiting'

export interface PomodoroSettings {
  workMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  sessionsBeforeLongBreak: number
  /**
   * The user-curated subset of tag ids that count as time-tracking
   * categories in stats. Deliberately a subset, not "all tags" — a tag like
   * "Home" (where you do something) isn't a meaningful measure of time the
   * way "School"/"Work" (what the time was for) are; the user opts tags in
   * via the settings panel.
   */
  trackedTagIds: string[]
  /** Play a chime when a phase ends. */
  soundEnabled: boolean
  /** Fire a browser Notification when a phase ends (needs OS permission,
   * requested from the settings panel — this flag only records the intent). */
  notificationsEnabled: boolean
}

/**
 * One contiguous stretch of wall-clock time the timer was actually running.
 * A phase paused halfway through and resumed twenty minutes later has two
 * segments. Elapsed time is *derived* from these rather than stored alongside
 * them, so the two can never disagree.
 */
export interface FocusSegment {
  startedAt: string
  endedAt: string
}

export interface PomodoroRunState {
  status: PomodoroStatus
  phase: PomodoroPhase
  /** ISO instant this phase's clock last (re)started; null unless running. */
  runningStartedAt: string | null
  /** Closed active intervals of *this phase*, accumulated across pause/resume. */
  segments: FocusSegment[]
  /**
   * Id of the phase currently in flight, minted when it starts. Time entries
   * opened during it carry this as their `phaseId`, which is what lets the
   * ledger and the phase log be joined without either owning the other.
   * Null while idle.
   */
  phaseId: string | null
  /** Completed work sessions since the last long break, 0..sessionsBeforeLongBreak-1. */
  sessionsCompletedInCycle: number
}

export function defaultPomodoroSettings(): PomodoroSettings {
  return {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    trackedTagIds: [],
    soundEnabled: true,
    notificationsEnabled: true,
  }
}

export const IDLE_RUN_STATE: PomodoroRunState = {
  status: 'idle',
  phase: 'work',
  runningStartedAt: null,
  segments: [],
  phaseId: null,
  sessionsCompletedInCycle: 0,
}

export function phaseDurationMinutes(phase: PomodoroPhase, settings: PomodoroSettings): number {
  if (phase === 'work') return settings.workMinutes
  if (phase === 'shortBreak') return settings.shortBreakMinutes
  return settings.longBreakMinutes
}

/**
 * The phase transition table: work -> short break (or long break once the
 * cycle's worth of work sessions is done, resetting the counter); any break
 * -> work. `sessionsCompletedInCycle` counts *completed* work sessions.
 */
export function nextPhase(
  phase: PomodoroPhase,
  sessionsCompletedInCycle: number,
  settings: PomodoroSettings,
): { phase: PomodoroPhase; sessionsCompletedInCycle: number } {
  if (phase !== 'work') return { phase: 'work', sessionsCompletedInCycle }
  const completed = sessionsCompletedInCycle + 1
  if (completed >= settings.sessionsBeforeLongBreak) return { phase: 'longBreak', sessionsCompletedInCycle: 0 }
  return { phase: 'shortBreak', sessionsCompletedInCycle: completed }
}

/** Total ms across a list of closed segments. */
export function segmentsMs(segments: FocusSegment[]): number {
  return segments.reduce((sum, s) => sum + (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()), 0)
}

/** ms of the current phase elapsed as of `now` — frozen exactly while paused. */
export function elapsedMs(run: PomodoroRunState, now: Date): number {
  const running =
    run.status === 'running' && run.runningStartedAt !== null
      ? now.getTime() - new Date(run.runningStartedAt).getTime()
      : 0
  return segmentsMs(run.segments) + Math.max(0, running)
}

export function remainingMs(run: PomodoroRunState, settings: PomodoroSettings, now: Date): number {
  return Math.max(0, phaseDurationMinutes(run.phase, settings) * 60_000 - elapsedMs(run, now))
}

/** Closes the in-flight segment at `at`, returning the full segment list. */
export function closeSegments(run: PomodoroRunState, at: Date): FocusSegment[] {
  if (run.status !== 'running' || run.runningStartedAt === null) return run.segments
  const endedAt = at.toISOString()
  // A zero/negative slice (clock skew, a double-fire) is dropped rather than
  // recorded as a backwards interval.
  if (new Date(endedAt).getTime() <= new Date(run.runningStartedAt).getTime()) return run.segments
  return [...run.segments, { startedAt: run.runningStartedAt, endedAt }]
}

export interface CompletedPhase {
  /** The id this phase carried while it ran — carried through so the record
   * written from it keeps the same identity the time entries reference. */
  id: string | null
  phase: PomodoroPhase
  /** First moment the phase's clock ever ran (ignores later pause gaps). */
  startedAt: string
  /** The instant the phase hit its full length — not `now`, which may be later. */
  endedAt: string
  durationMinutes: number
  /** The real running intervals, pause gaps excluded — what attribution uses. */
  segments: FocusSegment[]
}

/**
 * Completes the current phase if its full length has elapsed as of `now`,
 * parking the run in `awaiting` on the *next* phase. Deliberately advances
 * at most one phase: with manual start required at every seam, a tab left
 * closed for three hours comes back to "focus finished at 10:25, press
 * start when you're ready" rather than having silently burned through six
 * imaginary phases. That also means the recorded `endedAt` is the true
 * phase-end instant, which is what keeps timeline-based attribution honest.
 */
export function advancePhase(
  run: PomodoroRunState,
  settings: PomodoroSettings,
  now: Date,
): { run: PomodoroRunState; completed: CompletedPhase | null } {
  if (run.status !== 'running' || run.runningStartedAt === null) return { run, completed: null }
  if (remainingMs(run, settings, now) > 0) return { run, completed: null }

  const phaseMinutes = phaseDurationMinutes(run.phase, settings)
  // The instant this phase's clock hit its full length: the current slice
  // only needed (duration - already-banked) more ms to get there.
  const endMs = new Date(run.runningStartedAt).getTime() + phaseMinutes * 60_000 - segmentsMs(run.segments)
  const segments = [...run.segments, { startedAt: run.runningStartedAt, endedAt: new Date(endMs).toISOString() }]
  const next = nextPhase(run.phase, run.sessionsCompletedInCycle, settings)

  return {
    run: {
      ...run,
      status: 'awaiting',
      phase: next.phase,
      sessionsCompletedInCycle: next.sessionsCompletedInCycle,
      runningStartedAt: null,
      segments: [],
      // The finished phase's id belongs to the record now; the next phase
      // mints its own when it actually starts.
      phaseId: null,
    },
    completed: {
      id: run.phaseId,
      phase: run.phase,
      startedAt: segments[0].startedAt,
      endedAt: new Date(endMs).toISOString(),
      durationMinutes: phaseMinutes,
      segments,
    },
  }
}
