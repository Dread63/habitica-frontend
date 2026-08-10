import type { Task } from '@/lib/habitica/types'

/**
 * The feature this whole project exists for (see CLAUDE.md). Habitica's own
 * frontend only supports one bucket — AND-only, include-only. This is three
 * independent buckets instead:
 *
 * - `anyOf` — task matches if it has AT LEAST ONE of these tags (OR)
 * - `allOf` — task matches only if it has ALL of these tags (AND — Habitica's
 *   current-and-only behavior, kept as an option, not removed)
 * - `noneOf` — task is EXCLUDED if it has any of these tags
 *
 * Pure, no React/Zustand/API involved — see tagFilterStore.ts for the
 * stateful wrapper and TagChip.tsx for the UI. Test this file exhaustively
 * before touching either of those; it's the one piece of real business
 * logic in the tag-filter feature.
 */
export interface TagFilterState {
  anyOf: string[]
  allOf: string[]
  noneOf: string[]
}

export const EMPTY_TAG_FILTER: TagFilterState = { anyOf: [], allOf: [], noneOf: [] }

export function isTagFilterEmpty(filter: TagFilterState): boolean {
  return filter.anyOf.length === 0 && filter.allOf.length === 0 && filter.noneOf.length === 0
}

/**
 * `noneOf` is checked first and wins over the others — if a tag somehow
 * ends up in both `noneOf` and `anyOf`/`allOf` (shouldn't happen via the
 * normal cycle-through-states UI, which keeps a tag in exactly one bucket,
 * but a saved preset could be hand-edited, or bucket membership could
 * change from tag deletion elsewhere), exclusion is the more specific,
 * more conservative signal and takes priority.
 */
export function taskMatchesTagFilter(task: Pick<Task, 'tags'>, filter: TagFilterState): boolean {
  if (filter.noneOf.length > 0 && task.tags.some((t) => filter.noneOf.includes(t))) return false
  if (filter.allOf.length > 0 && !filter.allOf.every((t) => task.tags.includes(t))) return false
  if (filter.anyOf.length > 0 && !filter.anyOf.some((t) => task.tags.includes(t))) return false
  return true
}

export function filterTasksByTags<T extends Pick<Task, 'tags'>>(tasks: T[], filter: TagFilterState): T[] {
  if (isTagFilterEmpty(filter)) return tasks
  return tasks.filter((task) => taskMatchesTagFilter(task, filter))
}

export type TagBucket = 'anyOf' | 'allOf' | 'noneOf'

/** Which bucket (if any) a tag currently sits in — for rendering chip state. */
export function bucketOf(filter: TagFilterState, tagId: string): TagBucket | 'neutral' {
  if (filter.anyOf.includes(tagId)) return 'anyOf'
  if (filter.allOf.includes(tagId)) return 'allOf'
  if (filter.noneOf.includes(tagId)) return 'noneOf'
  return 'neutral'
}

function without(list: string[], tagId: string): string[] {
  return list.filter((t) => t !== tagId)
}

/**
 * Pure state transition: neutral -> anyOf (OR) -> allOf (AND) -> noneOf
 * (exclude) -> neutral, on each click of a tag chip. A tag is in at most
 * one bucket at a time (this is how a tag *enters* multiple buckets is
 * prevented — see the noneOf-wins comment on taskMatchesTagFilter for why
 * the matcher still guards against it happening some other way).
 */
export function cycleTagInFilter(filter: TagFilterState, tagId: string): TagFilterState {
  const current = bucketOf(filter, tagId)
  const cleared: TagFilterState = {
    anyOf: without(filter.anyOf, tagId),
    allOf: without(filter.allOf, tagId),
    noneOf: without(filter.noneOf, tagId),
  }
  switch (current) {
    case 'neutral':
      return { ...cleared, anyOf: [...cleared.anyOf, tagId] }
    case 'anyOf':
      return { ...cleared, allOf: [...cleared.allOf, tagId] }
    case 'allOf':
      return { ...cleared, noneOf: [...cleared.noneOf, tagId] }
    case 'noneOf':
      return cleared
  }
}

/** Used when a tag is deleted — drop it from whichever bucket it's in, if any. */
export function removeTagFromFilter(filter: TagFilterState, tagId: string): TagFilterState {
  return {
    anyOf: without(filter.anyOf, tagId),
    allOf: without(filter.allOf, tagId),
    noneOf: without(filter.noneOf, tagId),
  }
}
