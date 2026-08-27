import { segmentsMs, type FocusSegment, type PomodoroPhase } from './pomodoroEngine'

/**
 * What the timer did — as distinct from where the time went, which lives in
 * the time-entry ledger (features/tracking).
 *
 * Splitting these apart is the thing that makes the model honest. A phase
 * record is a fact about a *machine*: the clock ran for 25 minutes starting
 * at 09:00. A time entry is a claim about a *person*: you were on the report
 * from 09:00 to 09:31. Those two legitimately disagree — you keep working
 * past the bell, you walk away mid-phase, you close the laptop — and
 * collapsing them into one number, which is what the old
 * `PomodoroSessionRecord` did, is what forced every downstream figure to be
 * an inference.
 *
 * So: *"4 pomodoros · 1h 38m tracked"* is not a bug to be reconciled. Both
 * numbers are true and they answer different questions.
 *
 * Unlike time entries, these are **genuinely immutable** — nothing in the UI
 * edits one, and nothing should. This is the record that earns the
 * append-only storage the old focus_sessions table claimed.
 */
export interface PomodoroPhaseRecord {
  id: string
  /** Reuses the engine's union — breaks are recorded too, so "did I actually
   * take my breaks" is answerable. */
  phase: PomodoroPhase
  /** First moment this phase's clock ran. */
  startedAt: string
  /** The instant it stopped: the true phase-end for a natural completion,
   * `now` for a manual stop. Never the moment detection happened — advance()
   * can fire hours after the fact. */
  endedAt: string
  /** Nominal length from settings as they were at the time. */
  plannedMs: number
  /** The real running intervals, pause gaps excluded. Straight from
   * CompletedPhase.segments — the engine already produces exactly this. */
  segments: FocusSegment[]
  completedNaturally: boolean
}

/** Time the clock actually ran. Derived from segments rather than stored, so
 * there is no second number that can drift from them. */
export function phaseActualMs(record: PomodoroPhaseRecord): number {
  return segmentsMs(record.segments)
}

export function createPhaseRecord(
  params: Omit<PomodoroPhaseRecord, 'id'>,
  id: string = crypto.randomUUID(),
): PomodoroPhaseRecord {
  return { id, ...params }
}

/** Work phases only — breaks are recorded but are not focus. */
export function workPhases(records: PomodoroPhaseRecord[]): PomodoroPhaseRecord[] {
  return records.filter((r) => r.phase === 'work')
}

/** Completed pomodoros: work phases that ran their full length. */
export function completedPomodoros(records: PomodoroPhaseRecord[]): PomodoroPhaseRecord[] {
  return workPhases(records).filter((r) => r.completedNaturally)
}
