import { addDays, toDateOnlyString } from '@/lib/dateOnly'
import type { TimelineEntry } from '@/features/timeline/timelineEntries'
import { attributeFocusTime, type FocusAttribution } from './focusAttribution'
import {
  closeSegments,
  segmentsMs,
  type FocusSegment,
  type PomodoroRunState,
  type PomodoroTaskRef,
} from './pomodoroEngine'

/**
 * Pomodoro session history + category aggregation. A session record
 * snapshots its linked tasks' titles and tag ids at recording time, so
 * history stays readable ("Focus: 25 min — 'Finish report'") and category
 * math stays stable even after a task is deleted, renamed, or re-tagged —
 * deliberately the opposite of TimelineEntry, which *is* pruned when its
 * task dies (an entry pointing at nothing is clutter; history is a record
 * of real time spent).
 *
 * Each record also carries an `attribution` breakdown — the per-task split
 * of its minutes computed at phase end from the timeline (see
 * focusAttribution.ts). That, not the session's flat duration, is what
 * category totals are built from, so a 25-minute block covering ten minutes
 * of School and fifteen of Work reports exactly that.
 *
 * Category aggregation is a *live* intersection of those snapshots' tags
 * with the currently-tracked tag set (settings.trackedTagIds) — untracking a
 * tag immediately stops old sessions counting toward it, and tracking a new
 * one retroactively counts sessions whose tasks carried it.
 */

export interface PomodoroSessionRecord {
  id: string
  /** The linked set at recording time. Empty = untracked focus. Kept for
   * display; `attribution` is what stats actually measure. */
  tasks: PomodoroTaskRef[]
  /** Per-task minutes within this session. Sums to `durationMinutes` for
   * records written since attribution existed. */
  attribution: FocusAttribution[]
  startedAt: string
  endedAt: string
  /** Actual elapsed minutes — the nominal phase length for a naturally
   * completed phase, or less for a manually stopped partial session. */
  durationMinutes: number
  completedNaturally: boolean
}

export function recordSession(
  params: Omit<PomodoroSessionRecord, 'id'>,
  id: string = crypto.randomUUID(),
): PomodoroSessionRecord {
  return { id, ...params }
}

/** Fractional minutes, kept to 2dp so evenly-split time doesn't persist float noise. */
function toMinutes(ms: number): number {
  return Math.round((ms / 60_000) * 100) / 100
}

/**
 * The one place a session record is assembled from a set of running
 * segments — used both by the store when a focus phase is committed to
 * history and by `liveFocusSession` below for the in-progress preview, so
 * the two can't compute a session differently.
 */
export function buildSessionRecord(params: {
  segments: FocusSegment[]
  tasks: PomodoroTaskRef[]
  entries: TimelineEntry[]
  durationMinutes: number
  completedNaturally: boolean
  id?: string
}): PomodoroSessionRecord {
  const { segments, tasks, entries, durationMinutes, completedNaturally, id } = params
  const now = new Date().toISOString()
  return recordSession(
    {
      tasks,
      attribution: attributeFocusTime({ segments, entries, linkedTasks: tasks }),
      startedAt: segments[0]?.startedAt ?? now,
      endedAt: segments[segments.length - 1]?.endedAt ?? now,
      durationMinutes,
      completedNaturally,
    },
    id,
  )
}

/** Stable id for the provisional record, so React keys don't churn each tick. */
export const LIVE_SESSION_ID = 'live-focus-session'

/**
 * A provisional record for the focus phase happening *right now*, so the
 * stats surfaces move while you work instead of freezing for 25 minutes
 * between commits.
 *
 * This does not weaken the "attribute at phase end" rule — nothing here is
 * written to history, and when the phase does end the store recomputes the
 * real record from the final segments and the timeline as it stands then.
 * This is strictly a preview of what that record would say if the phase
 * stopped this second, and it's built by the same `buildSessionRecord` so it
 * can't drift from the committed version.
 *
 * Null unless a *work* phase has actually banked time: breaks aren't focus,
 * and an awaiting seam or a just-started phase has nothing to show yet.
 */
export function liveFocusSession(
  run: PomodoroRunState,
  entries: TimelineEntry[],
  now: Date,
): PomodoroSessionRecord | null {
  if (run.status !== 'running' && run.status !== 'paused') return null
  if (run.phase !== 'work') return null
  const segments = closeSegments(run, now)
  const elapsed = segmentsMs(segments)
  if (elapsed <= 0) return null
  return buildSessionRecord({
    segments,
    tasks: run.tasks,
    entries,
    durationMinutes: toMinutes(elapsed),
    // Not a finished pomodoro, so it never inflates the completed count.
    completedNaturally: false,
    id: LIVE_SESSION_ID,
  })
}

/**
 * tagId -> total focus minutes, for tracked tags only, summed over each
 * session's per-task attribution.
 *
 * A task carrying two *tracked* tags contributes its minutes fully to both
 * — chosen explicitly over splitting them, so a task tagged Work and Deep
 * Work isn't reported as half of each. The consequence is stated rather than
 * hidden: category totals can add up to more than the real elapsed time, so
 * nothing in the UI stacks these into a bar that claims to be a whole.
 */
export function aggregateByCategory(
  sessions: PomodoroSessionRecord[],
  trackedTagIds: string[],
): Record<string, number> {
  const tracked = new Set(trackedTagIds)
  const totals: Record<string, number> = {}
  for (const session of sessions) {
    for (const item of session.attribution) {
      for (const tagId of new Set(item.tagIds)) {
        if (tracked.has(tagId)) totals[tagId] = (totals[tagId] ?? 0) + item.minutes
      }
    }
  }
  return totals
}

/** Minutes that landed on no tracked tag at all — untracked tasks plus
 * genuinely uncategorized time. The honest remainder next to the category
 * totals above. */
export function untrackedMinutes(sessions: PomodoroSessionRecord[], trackedTagIds: string[]): number {
  const tracked = new Set(trackedTagIds)
  let total = 0
  for (const session of sessions) {
    for (const item of session.attribution) {
      if (!item.tagIds.some((t) => tracked.has(t))) total += item.minutes
    }
  }
  return total
}

export function totalFocusMinutes(sessions: PomodoroSessionRecord[]): number {
  return sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
}

/**
 * "45m" / "1h 20m" — attribution minutes are fractional, so this rounds.
 * A non-zero amount under half a minute reads "<1m" rather than "0m": an
 * evenly-split slice or a session stopped seconds in is real time, and
 * printing it as a flat zero next to a visible bar looks like a bug.
 */
export function formatFocusMinutes(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded === 0) return minutes > 0 ? '<1m' : '0m'
  if (rounded < 60) return `${rounded}m`
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Local "YYYY-MM-DD" of a session's start. */
function localDateOf(iso: string): string {
  return toDateOnlyString(new Date(iso))
}

/** Sessions whose (local) start day matches the given "YYYY-MM-DD". */
export function sessionsOnDate(sessions: PomodoroSessionRecord[], date: string): PomodoroSessionRecord[] {
  return sessions.filter((s) => localDateOf(s.startedAt) === date)
}

/**
 * One day of the trend chart: the day's real focus total, plus how that time
 * splits across tracked categories. `slices` uses each attribution item's
 * *first* tracked tag, not all of them — unlike the totals above, a stacked
 * column has to partition a whole, and double-counting there would draw
 * segments that sum past the column's own height. Documented here rather
 * than left as a silent discrepancy: the bar heights and the category list
 * answer slightly different questions, and both are right for theirs.
 */
export interface DayFocus {
  date: string
  totalMinutes: number
  sessions: number
  slices: { tagId: string | null; minutes: number }[]
}

export function dailyFocusSeries(
  sessions: PomodoroSessionRecord[],
  days: number,
  now: Date,
  trackedTagIds: string[],
): DayFocus[] {
  const tracked = new Set(trackedTagIds)
  const byDate = new Map<string, PomodoroSessionRecord[]>()
  for (const s of sessions) {
    const date = localDateOf(s.startedAt)
    const list = byDate.get(date)
    if (list) list.push(s)
    else byDate.set(date, [s])
  }

  return Array.from({ length: days }, (_, i) => {
    const date = toDateOnlyString(addDays(now, i - (days - 1)))
    const daySessions = byDate.get(date) ?? []
    const minutesByTag = new Map<string | null, number>()
    for (const s of daySessions) {
      for (const item of s.attribution) {
        const primary = trackedTagIds.find((t) => item.tagIds.includes(t)) ?? null
        minutesByTag.set(primary, (minutesByTag.get(primary) ?? 0) + item.minutes)
      }
    }
    // Order slices by the tracked-tag order so a category keeps the same
    // position (and therefore the same color) in every column.
    const slices = [...minutesByTag.entries()]
      .filter(([, minutes]) => minutes > 0)
      .sort((a, b) => {
        if (a[0] === null) return 1
        if (b[0] === null) return -1
        return trackedTagIds.indexOf(a[0]) - trackedTagIds.indexOf(b[0])
      })
      .map(([tagId, minutes]) => ({ tagId: tagId !== null && tracked.has(tagId) ? tagId : null, minutes }))
    return { date, totalMinutes: totalFocusMinutes(daySessions), sessions: daySessions.length, slices }
  })
}

/** Most-focused tasks across the given sessions, merged by task id. */
export function topTasks(
  sessions: PomodoroSessionRecord[],
  limit: number,
): { taskId: string | null; text: string; tagIds: string[]; minutes: number }[] {
  const byTask = new Map<string, { taskId: string | null; text: string; tagIds: string[]; minutes: number }>()
  for (const session of sessions) {
    for (const item of session.attribution) {
      const key = item.taskId ?? ''
      const existing = byTask.get(key)
      if (existing) {
        existing.minutes += item.minutes
        existing.text = item.text // freshest snapshot wins
        existing.tagIds = item.tagIds
      } else {
        byTask.set(key, { taskId: item.taskId, text: item.text, tagIds: [...item.tagIds], minutes: item.minutes })
      }
    }
  }
  return [...byTask.values()].sort((a, b) => b.minutes - a.minutes).slice(0, limit)
}

/** Display label for a session's linked tasks. */
export function sessionTasksLabel(session: Pick<PomodoroSessionRecord, 'tasks' | 'attribution'>): string {
  if (session.tasks.length > 0) return session.tasks.map((t) => t.text).join(' · ')
  // A session with no linked chips can still have attribution, from timeline
  // blocks that covered it — name those rather than calling it untracked.
  const named = session.attribution.filter((a) => a.taskId !== null)
  if (named.length > 0) return named.map((a) => a.text).join(' · ')
  return 'Untracked focus'
}
