import type { Task } from '@/lib/habitica/types'

/**
 * Redesigned from the original per-tag 3-bucket model (anyOf/allOf/noneOf)
 * after testing showed the any-vs-all distinction was invisible whenever
 * each bucket held only one tag — a 1-tag OR-group and a 1-tag AND-group
 * are mathematically identical, so two differently-colored chips *looked*
 * like they did the same thing until a second tag was added to one of
 * them. This version has ONE included-tags list plus a single explicit
 * mode governing how they combine, so any/all is always its own visible
 * control rather than something encoded ambiguously per-tag. Trade-off,
 * made deliberately: you can no longer mix "these are required" with
 * "any of these work" in a single filter (e.g. "Urgent AND (Home OR
 * Chores)") — every included tag now combines the same way.
 */
export type TagFilterMode = 'any' | 'all'

export interface TagFilterState {
  included: string[]
  mode: TagFilterMode
  excluded: string[]
}

export const EMPTY_TAG_FILTER: TagFilterState = { included: [], mode: 'any', excluded: [] }

export function isTagFilterEmpty(filter: TagFilterState): boolean {
  return filter.included.length === 0 && filter.excluded.length === 0
}

/** Excluded tags are checked first and always win, regardless of mode. */
export function taskMatchesTagFilter(task: Pick<Task, 'tags'>, filter: TagFilterState): boolean {
  if (filter.excluded.length > 0 && task.tags.some((t) => filter.excluded.includes(t))) return false
  if (filter.included.length === 0) return true
  return filter.mode === 'all'
    ? filter.included.every((t) => task.tags.includes(t))
    : filter.included.some((t) => task.tags.includes(t))
}

export function filterTasksByTags<T extends Pick<Task, 'tags'>>(tasks: T[], filter: TagFilterState): T[] {
  if (isTagFilterEmpty(filter)) return tasks
  return tasks.filter((task) => taskMatchesTagFilter(task, filter))
}

export type TagState = 'included' | 'excluded' | 'neutral'

/** Which state a tag chip should render as. */
export function stateOf(filter: TagFilterState, tagId: string): TagState {
  if (filter.included.includes(tagId)) return 'included'
  if (filter.excluded.includes(tagId)) return 'excluded'
  return 'neutral'
}

function without(list: string[], tagId: string): string[] {
  return list.filter((t) => t !== tagId)
}

/**
 * Pure state transition: neutral -> included -> excluded -> neutral, on
 * each click of a tag chip. The any/all mode is a separate, explicit
 * control (TagFilterSidebar's toggle) — not part of this per-tag cycle.
 */
export function cycleTagInFilter(filter: TagFilterState, tagId: string): TagFilterState {
  const current = stateOf(filter, tagId)
  const cleared: TagFilterState = {
    ...filter,
    included: without(filter.included, tagId),
    excluded: without(filter.excluded, tagId),
  }
  switch (current) {
    case 'neutral':
      return { ...cleared, included: [...cleared.included, tagId] }
    case 'included':
      return { ...cleared, excluded: [...cleared.excluded, tagId] }
    case 'excluded':
      return cleared
  }
}

/** Used when a tag is deleted — drop it from whichever list it's in, if any. */
export function removeTagFromFilter(filter: TagFilterState, tagId: string): TagFilterState {
  return {
    ...filter,
    included: without(filter.included, tagId),
    excluded: without(filter.excluded, tagId),
  }
}
