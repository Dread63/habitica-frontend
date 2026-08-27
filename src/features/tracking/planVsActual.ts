import { entryInterval, type TimelineEntry } from '@/features/timeline/timelineEntries'
import { addDays, parseDateOnlyString } from '@/lib/dateOnly'
import { entriesOverlappingDay, entryDurationMs, entryEndMs, type TimeEntry } from './timeEntries'

/**
 * Comparing the plan against the record.
 *
 * These are now genuinely separate things — timeline blocks are intentions
 * you can rearrange freely, time entries are what happened — which is exactly
 * what makes the comparison worth drawing. Under the old model the plan *was*
 * the evidence, so "planned vs actual" would have been comparing a number
 * with itself.
 *
 * Note the pleasing symmetry: the boundary-sweep in `adherentMs` below is the
 * same technique the deleted `attributeFocusTime` used. It was the wrong tool
 * for *inferring* what you did, and the right one for *comparing* two things
 * you already know.
 */

export interface PlanVsActualRow {
  taskId: string
  text: string
  plannedMs: number
  actualMs: number
  /** actual − planned. Negative means under-run. */
  deltaMs: number
}

export interface PlanVsActual {
  rows: PlanVsActualRow[]
  plannedMs: number
  trackedMs: number
  /** Time where the task you tracked matched the task you'd planned for that
   * instant — the interesting number, and the one a total can't show. */
  adherentMs: number
}

/** A block's wall-clock window clipped to the day, or null if it misses it. */
function planIntervalOn(entry: TimelineEntry, dayStart: number, dayEnd: number) {
  const interval = entryInterval(entry)
  if (interval === null) return null
  const start = Math.max(interval.start, dayStart)
  const end = Math.min(interval.end, dayEnd)
  return end > start ? { start, end, taskId: entry.taskId } : null
}

export function comparePlanToActual(
  plan: TimelineEntry[],
  actual: TimeEntry[],
  date: string,
  now: Date,
): PlanVsActual {
  const day = parseDateOnlyString(date)
  if (!day) return { rows: [], plannedMs: 0, trackedMs: 0, adherentMs: 0 }
  const dayStart = day.getTime()
  const dayEnd = addDays(day, 1).getTime()

  const planned = plan
    .filter((e) => e.date === date)
    .map((e) => planIntervalOn(e, dayStart, dayEnd))
    .filter((i): i is NonNullable<typeof i> => i !== null)
  const tracked = entriesOverlappingDay(actual, date, now)

  const rows = new Map<string, PlanVsActualRow>()
  const ensure = (taskId: string, text: string) => {
    const existing = rows.get(taskId)
    if (existing) return existing
    const row: PlanVsActualRow = { taskId, text, plannedMs: 0, actualMs: 0, deltaMs: 0 }
    rows.set(taskId, row)
    return row
  }

  for (const interval of planned) {
    // A planned block may point at a task never tracked, so its name has to
    // come from the plan side too.
    const source = plan.find((e) => e.taskId === interval.taskId)
    ensure(interval.taskId, source?.taskSnapshot?.text ?? 'Unknown task').plannedMs += interval.end - interval.start
  }
  for (const entry of tracked) {
    ensure(entry.taskId, entry.taskSnapshot.text).actualMs += entryDurationMs(entry, now)
  }
  for (const row of rows.values()) row.deltaMs = row.actualMs - row.plannedMs

  // One boundary sweep: at every instant where either side can change, ask
  // whether the tracked task is one the plan had scheduled then.
  const boundaries = new Set<number>([dayStart, dayEnd])
  for (const i of planned) {
    boundaries.add(i.start)
    boundaries.add(i.end)
  }
  for (const e of tracked) {
    boundaries.add(Date.parse(e.startedAt))
    boundaries.add(entryEndMs(e, now))
  }
  const points = [...boundaries].filter((p) => p >= dayStart && p <= dayEnd).sort((a, b) => a - b)

  let adherentMs = 0
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    if (to <= from) continue
    const trackedHere = tracked.find((e) => Date.parse(e.startedAt) <= from && to <= entryEndMs(e, now))
    if (!trackedHere) continue
    const plannedHere = planned.some((p) => p.start <= from && to <= p.end && p.taskId === trackedHere.taskId)
    if (plannedHere) adherentMs += to - from
  }

  return {
    rows: [...rows.values()].sort((a, b) => b.actualMs - a.actualMs || b.plannedMs - a.plannedMs),
    plannedMs: planned.reduce((sum, i) => sum + (i.end - i.start), 0),
    trackedMs: tracked.reduce((sum, e) => sum + entryDurationMs(e, now), 0),
    adherentMs,
  }
}

/** Minutes-since-midnight band for drawing an entry on the day scrubber. */
export function timeEntryToDayBand(
  entry: TimeEntry,
  date: string,
  now: Date,
): { startMinutes: number; endMinutes: number } | null {
  const day = parseDateOnlyString(date)
  if (!day) return null
  const dayStart = day.getTime()
  const dayEnd = addDays(day, 1).getTime()
  const start = Math.max(Date.parse(entry.startedAt), dayStart)
  const end = Math.min(entryEndMs(entry, now), dayEnd)
  if (end <= start) return null
  return {
    startMinutes: (start - dayStart) / 60_000,
    endMinutes: (end - dayStart) / 60_000,
  }
}
