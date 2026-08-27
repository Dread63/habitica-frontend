import { addDays, toDateOnlyString } from '@/lib/dateOnly'
import { entriesOverlappingDay, entryDurationMs, type TimeEntry } from './timeEntries'

/**
 * Aggregations over the time ledger.
 *
 * Every figure here is a **sum of recorded intervals**. There is no
 * attribution step, no even-splitting, and no reconstruction — that whole
 * layer is gone. If a number looks wrong now, the fix is to correct the
 * entry that produced it, which is a thing the user can actually see and do.
 */

/** "45m" / "1h 20m". A non-zero amount under half a minute reads "<1m" rather
 * than "0m": a 30-second entry is a real thing in this model, and printing it
 * as a flat zero next to a visible bar looks like a bug. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes === 0) return ms > 0 ? '<1m' : '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function totalTrackedMs(entries: TimeEntry[], now: Date): number {
  return entries.reduce((sum, entry) => sum + entryDurationMs(entry, now), 0)
}

/**
 * tagId -> tracked ms, for tracked tags only.
 *
 * A task carrying two *tracked* tags contributes its time fully to both —
 * kept deliberately from the previous model, so a task tagged Work and Deep
 * Work isn't reported as half of each. The consequence is stated rather than
 * hidden: these totals can add up to more than the real elapsed time, so
 * nothing in the UI stacks them into a bar that claims to be a whole.
 */
export function aggregateByCategory(
  entries: TimeEntry[],
  trackedTagIds: string[],
  now: Date,
): Record<string, number> {
  const tracked = new Set(trackedTagIds)
  const totals: Record<string, number> = {}
  for (const entry of entries) {
    const ms = entryDurationMs(entry, now)
    for (const tagId of new Set(entry.taskSnapshot.tagIds)) {
      if (tracked.has(tagId)) totals[tagId] = (totals[tagId] ?? 0) + ms
    }
  }
  return totals
}

/** Tracked time that landed on no tracked tag at all — the honest remainder
 * beside the category totals above. */
export function untrackedCategoryMs(entries: TimeEntry[], trackedTagIds: string[], now: Date): number {
  const tracked = new Set(trackedTagIds)
  return entries
    .filter((entry) => !entry.taskSnapshot.tagIds.some((t) => tracked.has(t)))
    .reduce((sum, entry) => sum + entryDurationMs(entry, now), 0)
}

export interface DayFocus {
  date: string
  totalMs: number
  entryCount: number
  slices: { tagId: string | null; ms: number }[]
}

/**
 * One day per bucket for the trend chart.
 *
 * `slices` uses each entry's *first* tracked tag, not all of them — unlike
 * the totals above, a stacked column has to partition a whole, and
 * double-counting there would draw segments summing past the column's own
 * height. Documented rather than left as a silent discrepancy: the bar
 * heights and the category list answer slightly different questions, and both
 * are right for theirs.
 */
export function dailyFocusSeries(
  entries: TimeEntry[],
  days: number,
  now: Date,
  trackedTagIds: string[],
): DayFocus[] {
  return Array.from({ length: days }, (_, i) => {
    const date = toDateOnlyString(addDays(now, i - (days - 1)))
    const dayEntries = entriesOverlappingDay(entries, date, now)
    const msByTag = new Map<string | null, number>()
    for (const entry of dayEntries) {
      const primary = trackedTagIds.find((t) => entry.taskSnapshot.tagIds.includes(t)) ?? null
      msByTag.set(primary, (msByTag.get(primary) ?? 0) + entryDurationMs(entry, now))
    }
    // Ordered by the tracked-tag order so a category keeps the same position
    // — and therefore the same colour — in every column.
    const slices = [...msByTag.entries()]
      .filter(([, ms]) => ms > 0)
      .sort((a, b) => {
        if (a[0] === null) return 1
        if (b[0] === null) return -1
        return trackedTagIds.indexOf(a[0]) - trackedTagIds.indexOf(b[0])
      })
      .map(([tagId, ms]) => ({ tagId, ms }))
    return { date, totalMs: totalTrackedMs(dayEntries, now), entryCount: dayEntries.length, slices }
  })
}

export interface TaskTotal {
  taskId: string
  text: string
  tagIds: string[]
  ms: number
}

/** Most-tracked tasks, merged by task id. */
export function topTasks(entries: TimeEntry[], limit: number, now: Date): TaskTotal[] {
  const byTask = new Map<string, TaskTotal>()
  for (const entry of entries) {
    const existing = byTask.get(entry.taskId)
    const ms = entryDurationMs(entry, now)
    if (existing) {
      existing.ms += ms
      // Freshest snapshot wins, so a renamed task shows its current name.
      existing.text = entry.taskSnapshot.text
      existing.tagIds = entry.taskSnapshot.tagIds
    } else {
      byTask.set(entry.taskId, {
        taskId: entry.taskId,
        text: entry.taskSnapshot.text,
        tagIds: [...entry.taskSnapshot.tagIds],
        ms,
      })
    }
  }
  return [...byTask.values()].sort((a, b) => b.ms - a.ms).slice(0, limit)
}

/** Distinct tasks touched — the denominator for "+N more" in a top-N list. */
export function distinctTaskCount(entries: TimeEntry[]): number {
  return new Set(entries.map((e) => e.taskId)).size
}
