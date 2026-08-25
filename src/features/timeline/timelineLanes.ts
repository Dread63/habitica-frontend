import type { TimelineEntry } from './timelineEntries'

export interface LanedEntry {
  entry: TimelineEntry
  /** 0-indexed vertical stacking row within the scrubber. */
  lane: number
}

/**
 * Greedy interval packing (the classic "minimum meeting rooms" algorithm,
 * the same one calendar day-views use for side-by-side events) — overlapping
 * entries stack into separate lanes so multitasking renders as visibly
 * concurrent blocks instead of being prevented or collapsed (an explicit
 * requirement). The stacking axis here is vertical lanes, since time itself
 * already runs horizontally on this timeline.
 *
 * Guarantees:
 * - Lane-optimal: uses exactly as many lanes as the day's maximum
 *   simultaneous overlap requires (a chain A↔B, B↔C where A and C don't
 *   overlap gets 2 lanes, not 3; freed lanes are reused).
 * - Intervals are half-open [start, start+duration) — two blocks that
 *   exactly touch are back-to-back, not overlapping.
 * - Deterministic regardless of input array order (sorts internally; ties
 *   broken by duration desc then id).
 *
 * Pixel positioning (left/width/top) is render-only math in
 * TimelineScrubber — this function only assigns lane indices.
 */
export function assignLanes(entries: TimelineEntry[]): { laned: LanedEntry[]; laneCount: number } {
  const sorted = [...entries].sort(
    (a, b) =>
      a.startMinutes - b.startMinutes ||
      b.durationMinutes - a.durationMinutes ||
      a.id.localeCompare(b.id),
  )

  const laneEndTimes: number[] = []
  const laned: LanedEntry[] = []

  for (const entry of sorted) {
    let lane = laneEndTimes.findIndex((end) => end <= entry.startMinutes)
    if (lane === -1) {
      lane = laneEndTimes.length
      laneEndTimes.push(0)
    }
    laneEndTimes[lane] = entry.startMinutes + entry.durationMinutes
    laned.push({ entry, lane })
  }

  return { laned, laneCount: laneEndTimes.length }
}
