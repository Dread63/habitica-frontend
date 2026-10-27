import { entryInterval, type TimelineEntry } from '@/features/timeline/timelineEntries'
import type { TimeEntry } from '@/features/tracking/timeEntries'
import { isActivityId, normaliseActivityLabel, activityLabelOf, type TimeSubject } from './subject'

/**
 * The activity list is **derived, never stored**.
 *
 * There is no activity registry and no new persisted store, which is the whole
 * point: nothing to migrate, nothing to add to the sync protocol (whose record
 * kinds are fixed — see docs/architecture.md § One small backend), no server
 * table, and no way for a definition to drift out of step with the entries that
 * reference it. An activity exists exactly as long as something in the ledger
 * or the plan mentions it, and stops existing when nothing does.
 *
 * The trade this makes: you cannot rename an activity, and you cannot create
 * one "for later" without placing it somewhere. Both are acceptable — a
 * different label is simply a different subject (see subject.ts), and placing
 * it is what you were doing anyway.
 */
export interface ActivitySuggestion extends TimeSubject {
  /** ms epoch of the most recent use — a ledger entry's start, or a planned
   * block's start instant. Drives the ordering, newest first. */
  lastUsedAt: number
}

interface Sighting {
  id: string
  text: string
  tagIds: string[]
  at: number
}

function sightingsFromLedger(entries: TimeEntry[]): Sighting[] {
  const out: Sighting[] = []
  for (const entry of entries) {
    if (!isActivityId(entry.taskId)) continue
    out.push({
      id: entry.taskId,
      text: entry.taskSnapshot.text,
      tagIds: entry.taskSnapshot.tagIds,
      at: Date.parse(entry.startedAt),
    })
  }
  return out
}

function sightingsFromPlan(entries: TimelineEntry[]): Sighting[] {
  const out: Sighting[] = []
  for (const entry of entries) {
    if (!isActivityId(entry.taskId)) continue
    const interval = entryInterval(entry)
    if (interval === null) continue
    out.push({
      id: entry.taskId,
      // A v1 entry can have no snapshot at all; the id still carries the
      // normalised label, which is a worse name than the one that was typed
      // but a much better one than "Unknown".
      text: entry.taskSnapshot?.text ?? activityLabelOf(entry.taskId),
      tagIds: entry.taskSnapshot?.tagIds ?? [],
      at: interval.start,
    })
  }
  return out
}

/**
 * Every distinct activity across both records, most recently used first.
 *
 * Label and tags come from the **most recent** sighting, so re-tagging an
 * activity is just a matter of using it again with the new tags — the picker
 * then offers those tags by default next time. `Number.isNaN` guards an
 * unparseable `startedAt` rather than letting it sort to the front.
 */
export function recentActivities(
  timeEntries: TimeEntry[],
  timelineEntries: TimelineEntry[],
  limit?: number,
): ActivitySuggestion[] {
  const byId = new Map<string, Sighting>()
  for (const sighting of [...sightingsFromLedger(timeEntries), ...sightingsFromPlan(timelineEntries)]) {
    if (Number.isNaN(sighting.at)) continue
    const existing = byId.get(sighting.id)
    if (existing === undefined || sighting.at > existing.at) byId.set(sighting.id, sighting)
  }

  const sorted = [...byId.values()]
    // Ties broken by id so the order is deterministic regardless of input
    // order — same rule as the lane packer.
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .map(({ id, text, tagIds, at }): ActivitySuggestion => ({ id, text, tagIds, lastUsedAt: at }))

  return limit === undefined ? sorted : sorted.slice(0, limit)
}

/**
 * Case-insensitive substring match on the label.
 *
 * Deliberately **not** the three-tier title/checklist/notes ranking that
 * `taskSearch.ts` applies to tasks: an activity has only a label, so claiming
 * the same tiers would be dishonest about what was searched.
 */
export function matchesActivityLabel(activity: ActivitySuggestion, query: string): boolean {
  const q = normaliseActivityLabel(query)
  if (q === '') return true
  return normaliseActivityLabel(activity.text).includes(q)
}

/** Filters and preserves recency order. An empty query returns the input
 * array unchanged, matching `searchTasks`' convention. */
export function searchActivities(activities: ActivitySuggestion[], query: string): ActivitySuggestion[] {
  if (normaliseActivityLabel(query) === '') return activities
  return activities.filter((a) => matchesActivityLabel(a, query))
}
