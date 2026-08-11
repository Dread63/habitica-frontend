import { describe, it, expect } from 'vitest'
import {
  EMPTY_TAG_FILTER,
  filterTasksByTags,
  isTagFilterEmpty,
  removeTagFromFilter,
  stateOf,
  taskMatchesTagFilter,
  toggleExcluded,
  toggleIncluded,
  type TagFilterState,
} from './tagFilter'

const HOME = 'home'
const CHORES = 'chores'
const WORK = 'work'
const URGENT = 'urgent'

function task(tags: string[]) {
  return { tags }
}

describe('taskMatchesTagFilter', () => {
  it('an empty filter matches every task', () => {
    expect(taskMatchesTagFilter(task([]), EMPTY_TAG_FILTER)).toBe(true)
    expect(taskMatchesTagFilter(task([HOME, WORK]), EMPTY_TAG_FILTER)).toBe(true)
  })

  describe('mode: any (OR)', () => {
    const filter: TagFilterState = { included: [HOME, CHORES], mode: 'any', excluded: [] }

    it('matches a task with exactly one of the included tags', () => {
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(true)
      expect(taskMatchesTagFilter(task([CHORES]), filter)).toBe(true)
    })

    it('matches a task with both included tags', () => {
      expect(taskMatchesTagFilter(task([HOME, CHORES]), filter)).toBe(true)
    })

    it('matches a task with an included tag plus unrelated tags', () => {
      expect(taskMatchesTagFilter(task([HOME, WORK]), filter)).toBe(true)
    })

    it('rejects a task with none of the included tags', () => {
      expect(taskMatchesTagFilter(task([WORK]), filter)).toBe(false)
      expect(taskMatchesTagFilter(task([]), filter)).toBe(false)
    })
  })

  describe('mode: all (AND) — this alone reproduces Habitica default behavior', () => {
    const filter: TagFilterState = { included: [HOME, CHORES], mode: 'all', excluded: [] }

    it('rejects a task with only one of the required tags', () => {
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(false)
      expect(taskMatchesTagFilter(task([CHORES]), filter)).toBe(false)
    })

    it('matches a task with all required tags', () => {
      expect(taskMatchesTagFilter(task([HOME, CHORES]), filter)).toBe(true)
    })

    it('matches a task with all required tags plus extras', () => {
      expect(taskMatchesTagFilter(task([HOME, CHORES, WORK]), filter)).toBe(true)
    })

    it('rejects a task with none of the required tags', () => {
      expect(taskMatchesTagFilter(task([]), filter)).toBe(false)
    })
  })

  it('with exactly one included tag, mode makes no difference (the degenerate case that motivated this redesign)', () => {
    const anyMode: TagFilterState = { included: [HOME], mode: 'any', excluded: [] }
    const allMode: TagFilterState = { included: [HOME], mode: 'all', excluded: [] }
    for (const tags of [[], [HOME], [HOME, WORK], [WORK]]) {
      expect(taskMatchesTagFilter(task(tags), anyMode)).toBe(taskMatchesTagFilter(task(tags), allMode))
    }
  })

  describe('excluded', () => {
    const filter: TagFilterState = { included: [], mode: 'any', excluded: [URGENT] }

    it('rejects a task carrying the excluded tag', () => {
      expect(taskMatchesTagFilter(task([URGENT]), filter)).toBe(false)
      expect(taskMatchesTagFilter(task([URGENT, HOME]), filter)).toBe(false)
    })

    it('matches a task without the excluded tag', () => {
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(true)
      expect(taskMatchesTagFilter(task([]), filter)).toBe(true)
    })
  })

  describe('included + excluded together', () => {
    it('exclude wins even when the included condition (mode: any) would otherwise match', () => {
      const filter: TagFilterState = { included: [HOME], mode: 'any', excluded: [URGENT] }
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(true)
      expect(taskMatchesTagFilter(task([HOME, URGENT]), filter)).toBe(false)
    })

    it('exclude wins even when the included condition (mode: all) is satisfied', () => {
      const filter: TagFilterState = { included: [HOME], mode: 'all', excluded: [URGENT] }
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(true)
      expect(taskMatchesTagFilter(task([HOME, URGENT]), filter)).toBe(false)
    })

    it('a tag present in both included and excluded (should not happen via the UI cycle, but the matcher must still be safe): exclude wins', () => {
      const filter: TagFilterState = { included: [HOME], mode: 'any', excluded: [HOME] }
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(false)
    })
  })
})

describe('isTagFilterEmpty', () => {
  it('true for the empty filter', () => {
    expect(isTagFilterEmpty(EMPTY_TAG_FILTER)).toBe(true)
  })

  it('false if included or excluded has an entry', () => {
    expect(isTagFilterEmpty({ included: [HOME], mode: 'any', excluded: [] })).toBe(false)
    expect(isTagFilterEmpty({ included: [], mode: 'any', excluded: [HOME] })).toBe(false)
  })

  it('mode alone does not count as a non-empty filter', () => {
    expect(isTagFilterEmpty({ included: [], mode: 'all', excluded: [] })).toBe(true)
  })
})

describe('filterTasksByTags', () => {
  it('returns every task, unfiltered, for an empty filter', () => {
    const tasks = [task([HOME]), task([]), task([WORK, URGENT])]
    expect(filterTasksByTags(tasks, EMPTY_TAG_FILTER)).toEqual(tasks)
  })

  it('filters down to only matching tasks', () => {
    const tasks = [task([HOME]), task([WORK]), task([HOME, WORK])]
    const filter: TagFilterState = { included: [HOME], mode: 'any', excluded: [] }
    expect(filterTasksByTags(tasks, filter)).toEqual([task([HOME]), task([HOME, WORK])])
  })
})

describe('stateOf', () => {
  it('reports neutral for a tag in neither list', () => {
    expect(stateOf(EMPTY_TAG_FILTER, HOME)).toBe('neutral')
  })

  it('reports included / excluded correctly', () => {
    expect(stateOf({ included: [HOME], mode: 'any', excluded: [] }, HOME)).toBe('included')
    expect(stateOf({ included: [], mode: 'any', excluded: [HOME] }, HOME)).toBe('excluded')
  })
})

describe('toggleIncluded', () => {
  it('is a plain 2-state toggle: neutral -> included -> neutral', () => {
    let filter = EMPTY_TAG_FILTER
    expect(stateOf(filter, HOME)).toBe('neutral')

    filter = toggleIncluded(filter, HOME)
    expect(stateOf(filter, HOME)).toBe('included')

    filter = toggleIncluded(filter, HOME)
    expect(stateOf(filter, HOME)).toBe('neutral')
    expect(filter).toEqual(EMPTY_TAG_FILTER)
  })

  it('toggling a currently-excluded tag goes straight to included, not neutral first', () => {
    const filter: TagFilterState = { included: [], mode: 'any', excluded: [HOME] }
    const next = toggleIncluded(filter, HOME)
    expect(next.excluded).not.toContain(HOME)
    expect(next.included).toContain(HOME)
  })

  it('preserves the current mode', () => {
    let filter: TagFilterState = { included: [], mode: 'all', excluded: [] }
    filter = toggleIncluded(filter, HOME)
    expect(filter.mode).toBe('all')
    filter = toggleIncluded(filter, HOME)
    expect(filter.mode).toBe('all')
  })

  it('does not disturb other tags already placed', () => {
    const filter: TagFilterState = { included: [WORK], mode: 'any', excluded: [URGENT] }
    const next = toggleIncluded(filter, HOME)
    expect(next).toEqual({ included: [WORK, HOME], mode: 'any', excluded: [URGENT] })
  })
})

describe('toggleExcluded', () => {
  it('is a plain 2-state toggle: neutral -> excluded -> neutral', () => {
    let filter = EMPTY_TAG_FILTER
    filter = toggleExcluded(filter, HOME)
    expect(stateOf(filter, HOME)).toBe('excluded')

    filter = toggleExcluded(filter, HOME)
    expect(stateOf(filter, HOME)).toBe('neutral')
    expect(filter).toEqual(EMPTY_TAG_FILTER)
  })

  it('toggling a currently-included tag goes straight to excluded, not neutral first', () => {
    const filter: TagFilterState = { included: [HOME], mode: 'any', excluded: [] }
    const next = toggleExcluded(filter, HOME)
    expect(next.included).not.toContain(HOME)
    expect(next.excluded).toContain(HOME)
  })

  it('does not disturb other tags already placed', () => {
    const filter: TagFilterState = { included: [WORK], mode: 'any', excluded: [] }
    const next = toggleExcluded(filter, HOME)
    expect(next).toEqual({ included: [WORK], mode: 'any', excluded: [HOME] })
  })
})

describe('removeTagFromFilter', () => {
  it('removes the tag from whichever list it is in', () => {
    expect(removeTagFromFilter({ included: [HOME], mode: 'any', excluded: [] }, HOME)).toEqual(EMPTY_TAG_FILTER)
    expect(removeTagFromFilter({ included: [], mode: 'any', excluded: [HOME] }, HOME)).toEqual(EMPTY_TAG_FILTER)
  })

  it('is a no-op if the tag is not present anywhere', () => {
    const filter: TagFilterState = { included: [WORK], mode: 'any', excluded: [] }
    expect(removeTagFromFilter(filter, HOME)).toEqual(filter)
  })

  it('leaves other tags and the mode untouched', () => {
    const filter: TagFilterState = { included: [HOME, WORK], mode: 'all', excluded: [] }
    expect(removeTagFromFilter(filter, HOME)).toEqual({ included: [WORK], mode: 'all', excluded: [] })
  })
})
