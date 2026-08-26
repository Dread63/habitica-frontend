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
 *
 * The *state shape* here (included[]/mode/excluded[]) hasn't changed since
 * that redesign, but the UI's interaction with it has, a second time: the
 * chip click used to cycle through all three states (neutral -> included ->
 * excluded -> neutral), which meant undoing an accidental exclude took a
 * 3rd click for what's normally the common case. `toggleIncluded` is now a
 * plain 2-state click; `toggleExcluded` is a separate, secondary control
 * (TagChip's small corner button) for the rarer, more deliberate exclude
 * action. See those two functions' own comments.
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

function clearTag(filter: TagFilterState, tagId: string): TagFilterState {
  return {
    ...filter,
    included: without(filter.included, tagId),
    excluded: without(filter.excluded, tagId),
  }
}

/**
 * The chip's own click — a plain 2-state toggle between "not filtered" and
 * "included", not a 3-state cycle through excluded too. This used to be a
 * neutral -> included -> excluded -> neutral cycle (see this module's
 * history/git log), which meant undoing an accidental include-then-exclude
 * took a 3rd click; direct feedback called that clunky for what should be
 * the common case. Clicking a currently-excluded tag here goes straight to
 * included (not neutral first) — a plain click always means "I want this
 * tag active," regardless of what state it was in before.
 */
export function toggleIncluded(filter: TagFilterState, tagId: string): TagFilterState {
  const wasIncluded = filter.included.includes(tagId)
  const cleared = clearTag(filter, tagId)
  return wasIncluded ? cleared : { ...cleared, included: [...cleared.included, tagId] }
}

/**
 * The secondary "exclude" control (TagChip's small corner button, not the
 * chip body) — sets/unsets exclusion directly and independently of
 * `toggleIncluded`, since excluding is the rarer, more deliberate action
 * that no longer needs to sit on the same click path as including.
 */
export function toggleExcluded(filter: TagFilterState, tagId: string): TagFilterState {
  const wasExcluded = filter.excluded.includes(tagId)
  const cleared = clearTag(filter, tagId)
  return wasExcluded ? cleared : { ...cleared, excluded: [...cleared.excluded, tagId] }
}

/** Used when a tag is deleted — drop it from whichever list it's in, if any. */
export function removeTagFromFilter(filter: TagFilterState, tagId: string): TagFilterState {
  return {
    ...filter,
    included: without(filter.included, tagId),
    excluded: without(filter.excluded, tagId),
  }
}
