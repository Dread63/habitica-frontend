import {
  entryInterval,
  type TimelineEntry,
} from '@/features/timeline/timelineEntries'
import type { FocusSegment, PomodoroTaskRef } from './pomodoroEngine'

/**
 * Splitting a finished focus phase into per-task minutes.
 *
 * The old model credited a phase's *whole* length to every task linked to
 * it, so a 25-minute block covering ten minutes of School and fifteen of
 * Work reported 25 minutes of each. What actually knows how the time was
 * spent is the timeline — it already records what you were doing when — so
 * attribution overlaps the phase's real running intervals against the
 * timeline *as it stands at phase end*. Computing it at the end rather than
 * live is deliberate: blocks get dragged around mid-session, and the
 * arrangement you finished with is the one you meant.
 *
 * Pauses fall out of this for free, which is why segments exist at all: a
 * phase paused at 10:10 and resumed at 10:30 has two real intervals, and
 * the timeline keeps moving through the gap. Only the intervals the clock
 * actually ran get attributed.
 *
 * The rules, in order:
 *  - a block only covers time up to the moment its task was completed —
 *    finishing something early and starting its successor in the same slot
 *    must not keep feeding the finished one;
 *  - time covered by one timeline block goes to that block's task;
 *  - time covered by several overlapping blocks is split evenly between
 *    them (the timeline supports overlap; the total stays honest);
 *  - time covered by no block falls back to the session's linked tasks,
 *    split evenly — chosen explicitly over dropping it, so an unscheduled
 *    focus session still earns category credit;
 *  - time with neither is `taskId: null`, "Uncategorized".
 *
 * Tag-level double counting is a separate, deliberate decision made
 * downstream in pomodoroStats.ts: a task carrying two tracked tags counts
 * fully toward both.
 */

export interface FocusAttribution {
  /** null = neither a timeline block nor a linked task covered this time. */
  taskId: string | null
  text: string
  tagIds: string[]
  /** May be fractional — evenly split time rarely lands on whole minutes. */
  minutes: number
}

interface CoveringInterval {
  start: number
  end: number
  taskId: string
  text: string
  tagIds: string[]
}

/**
 * Identity for a scheduled task, preferring the (fresher) linked-task ref
 * over the entry's own snapshot. An entry predating snapshots with no
 * matching chip still attributes its *time* correctly — it just can't name
 * the task or find its tags, which is strictly better than dropping it.
 */
function identify(entry: TimelineEntry, linkedById: Map<string, PomodoroTaskRef>) {
  const linked = linkedById.get(entry.taskId)
  if (linked) return { text: linked.text, tagIds: linked.tagIds }
  const snapshot = entry.taskSnapshot
  return { text: snapshot?.text ?? 'Unknown task', tagIds: snapshot?.tagIds ?? [] }
}

export function attributeFocusTime(params: {
  segments: FocusSegment[]
  entries: TimelineEntry[]
  linkedTasks: PomodoroTaskRef[]
}): FocusAttribution[] {
  const { segments, entries, linkedTasks } = params
  const linkedById = new Map(linkedTasks.map((t) => [t.id, t]))

  const covering: CoveringInterval[] = []
  for (const entry of entries) {
    const interval = entryInterval(entry)
    if (interval === null) continue
    // A block stops absorbing time when its task is finished. Without this,
    // ticking a task off mid-block left it collecting the rest of its
    // scheduled window — so the minutes you then spent on its replacement
    // kept landing on the completed one. Time *before* the tick is still
    // credited to it: it was really spent there, and erasing that was never
    // the goal. A completed block with no known instant (a snapshot written
    // before this was recorded) keeps its old whole-window behavior and
    // corrects itself on the next snapshot sync.
    const completedAt = entry.taskSnapshot?.completedAt
    const cutoff = completedAt ? Date.parse(completedAt) : NaN
    const end = Number.isNaN(cutoff) ? interval.end : Math.min(interval.end, cutoff)
    if (end <= interval.start) continue
    covering.push({ start: interval.start, end, taskId: entry.taskId, ...identify(entry, linkedById) })
  }

  // taskId -> ms; the empty-string key stands in for "uncategorized", since
  // a Map keyed by `string | null` reads worse than one sentinel.
  const UNCATEGORIZED = ''
  const msByTask = new Map<string, number>()
  const refByTask = new Map<string, { text: string; tagIds: string[] }>()
  for (const t of linkedTasks) refByTask.set(t.id, { text: t.text, tagIds: t.tagIds })
  for (const c of covering) if (!refByTask.has(c.taskId)) refByTask.set(c.taskId, { text: c.text, tagIds: c.tagIds })

  const add = (taskId: string, ms: number) => msByTask.set(taskId, (msByTask.get(taskId) ?? 0) + ms)

  for (const segment of segments) {
    const segStart = new Date(segment.startedAt).getTime()
    const segEnd = new Date(segment.endedAt).getTime()
    if (!(segEnd > segStart)) continue

    // Every point where coverage can change, clipped into the segment.
    const boundaries = new Set<number>([segStart, segEnd])
    for (const c of covering) {
      if (c.start > segStart && c.start < segEnd) boundaries.add(c.start)
      if (c.end > segStart && c.end < segEnd) boundaries.add(c.end)
    }
    const points = [...boundaries].sort((a, b) => a - b)

    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]
      const to = points[i + 1]
      const span = to - from
      if (span <= 0) continue

      // Coverage is constant across a sub-interval by construction, so a
      // containment test at its edges is exact — no midpoint sampling.
      const taskIds = new Set<string>()
      for (const c of covering) if (c.start <= from && to <= c.end) taskIds.add(c.taskId)

      if (taskIds.size > 0) {
        for (const taskId of taskIds) add(taskId, span / taskIds.size)
      } else if (linkedTasks.length > 0) {
        for (const t of linkedTasks) add(t.id, span / linkedTasks.length)
      } else {
        add(UNCATEGORIZED, span)
      }
    }
  }

  return [...msByTask.entries()]
    .filter(([, ms]) => ms > 0)
    .map(([taskId, ms]) => {
      const ref = refByTask.get(taskId)
      return {
        taskId: taskId === UNCATEGORIZED ? null : taskId,
        text: taskId === UNCATEGORIZED ? 'Uncategorized' : (ref?.text ?? 'Unknown task'),
        tagIds: taskId === UNCATEGORIZED ? [] : (ref?.tagIds ?? []),
        // Two decimals: enough to keep an even three-way split from drifting
        // visibly, without persisting float noise into localStorage.
        minutes: Math.round((ms / 60_000) * 100) / 100,
      }
    })
    .sort((a, b) => b.minutes - a.minutes)
}
