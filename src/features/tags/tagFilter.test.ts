import { describe, it, expect } from 'vitest'
import {
  EMPTY_TAG_FILTER,
  bucketOf,
  cycleTagInFilter,
  filterTasksByTags,
  isTagFilterEmpty,
  removeTagFromFilter,
  taskMatchesTagFilter,
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

  describe('anyOf (OR)', () => {
    const filter: TagFilterState = { anyOf: [HOME, CHORES], allOf: [], noneOf: [] }

    it('matches a task with exactly one of the anyOf tags', () => {
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(true)
      expect(taskMatchesTagFilter(task([CHORES]), filter)).toBe(true)
    })

    it('matches a task with both anyOf tags', () => {
      expect(taskMatchesTagFilter(task([HOME, CHORES]), filter)).toBe(true)
    })

    it('matches a task with an anyOf tag plus unrelated tags', () => {
      expect(taskMatchesTagFilter(task([HOME, WORK]), filter)).toBe(true)
    })

    it('rejects a task with none of the anyOf tags', () => {
      expect(taskMatchesTagFilter(task([WORK]), filter)).toBe(false)
      expect(taskMatchesTagFilter(task([]), filter)).toBe(false)
    })
  })

  describe('allOf (AND) — this alone reproduces Habitica default behavior', () => {
    const filter: TagFilterState = { anyOf: [], allOf: [HOME, CHORES], noneOf: [] }

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

  describe('noneOf (exclude)', () => {
    const filter: TagFilterState = { anyOf: [], allOf: [], noneOf: [URGENT] }

    it('rejects a task carrying the excluded tag', () => {
      expect(taskMatchesTagFilter(task([URGENT]), filter)).toBe(false)
      expect(taskMatchesTagFilter(task([URGENT, HOME]), filter)).toBe(false)
    })

    it('matches a task without the excluded tag', () => {
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(true)
      expect(taskMatchesTagFilter(task([]), filter)).toBe(true)
    })
  })

  describe('combined buckets', () => {
    it('anyOf + allOf: both conditions must hold', () => {
      const filter: TagFilterState = { anyOf: [WORK, URGENT], allOf: [HOME], noneOf: [] }
      // Has the required HOME, and at least one of WORK/URGENT
      expect(taskMatchesTagFilter(task([HOME, WORK]), filter)).toBe(true)
      // Has HOME but neither of the anyOf tags
      expect(taskMatchesTagFilter(task([HOME, CHORES]), filter)).toBe(false)
      // Has an anyOf tag but not the required HOME
      expect(taskMatchesTagFilter(task([WORK]), filter)).toBe(false)
    })

    it('anyOf + noneOf: exclude wins even when anyOf would otherwise match', () => {
      const filter: TagFilterState = { anyOf: [HOME], allOf: [], noneOf: [URGENT] }
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(true)
      expect(taskMatchesTagFilter(task([HOME, URGENT]), filter)).toBe(false)
    })

    it('allOf + noneOf: exclude wins even when allOf is satisfied', () => {
      const filter: TagFilterState = { anyOf: [], allOf: [HOME], noneOf: [URGENT] }
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(true)
      expect(taskMatchesTagFilter(task([HOME, URGENT]), filter)).toBe(false)
    })

    it('all three buckets together', () => {
      const filter: TagFilterState = { anyOf: [WORK, CHORES], allOf: [HOME], noneOf: [URGENT] }
      // HOME + CHORES (satisfies allOf and anyOf), no URGENT
      expect(taskMatchesTagFilter(task([HOME, CHORES]), filter)).toBe(true)
      // Same but with URGENT added -> excluded
      expect(taskMatchesTagFilter(task([HOME, CHORES, URGENT]), filter)).toBe(false)
      // Has HOME (allOf satisfied) but no anyOf tag
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(false)
    })

    it('a tag present in both noneOf and anyOf (should not happen via the UI cycle, but the matcher must still be safe): exclude wins', () => {
      const filter: TagFilterState = { anyOf: [HOME], allOf: [], noneOf: [HOME] }
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(false)
    })

    it('a tag present in both noneOf and allOf: exclude wins (the filter is simply unsatisfiable)', () => {
      const filter: TagFilterState = { anyOf: [], allOf: [HOME], noneOf: [HOME] }
      expect(taskMatchesTagFilter(task([HOME]), filter)).toBe(false)
    })
  })
})

describe('isTagFilterEmpty', () => {
  it('true for the empty filter', () => {
    expect(isTagFilterEmpty(EMPTY_TAG_FILTER)).toBe(true)
  })

  it('false if any bucket has an entry', () => {
    expect(isTagFilterEmpty({ anyOf: [HOME], allOf: [], noneOf: [] })).toBe(false)
    expect(isTagFilterEmpty({ anyOf: [], allOf: [HOME], noneOf: [] })).toBe(false)
    expect(isTagFilterEmpty({ anyOf: [], allOf: [], noneOf: [HOME] })).toBe(false)
  })
})

describe('filterTasksByTags', () => {
  it('returns every task, unfiltered, for an empty filter', () => {
    const tasks = [task([HOME]), task([]), task([WORK, URGENT])]
    expect(filterTasksByTags(tasks, EMPTY_TAG_FILTER)).toEqual(tasks)
  })

  it('filters down to only matching tasks', () => {
    const tasks = [task([HOME]), task([WORK]), task([HOME, WORK])]
    const filter: TagFilterState = { anyOf: [HOME], allOf: [], noneOf: [] }
    expect(filterTasksByTags(tasks, filter)).toEqual([task([HOME]), task([HOME, WORK])])
  })
})

describe('bucketOf', () => {
  it('reports neutral for a tag in no bucket', () => {
    expect(bucketOf(EMPTY_TAG_FILTER, HOME)).toBe('neutral')
  })

  it('reports the correct bucket for a tag placed in each', () => {
    expect(bucketOf({ anyOf: [HOME], allOf: [], noneOf: [] }, HOME)).toBe('anyOf')
    expect(bucketOf({ anyOf: [], allOf: [HOME], noneOf: [] }, HOME)).toBe('allOf')
    expect(bucketOf({ anyOf: [], allOf: [], noneOf: [HOME] }, HOME)).toBe('noneOf')
  })
})

describe('cycleTagInFilter', () => {
  it('walks neutral -> anyOf -> allOf -> noneOf -> neutral for one tag', () => {
    let filter = EMPTY_TAG_FILTER
    expect(bucketOf(filter, HOME)).toBe('neutral')

    filter = cycleTagInFilter(filter, HOME)
    expect(bucketOf(filter, HOME)).toBe('anyOf')

    filter = cycleTagInFilter(filter, HOME)
    expect(bucketOf(filter, HOME)).toBe('allOf')

    filter = cycleTagInFilter(filter, HOME)
    expect(bucketOf(filter, HOME)).toBe('noneOf')

    filter = cycleTagInFilter(filter, HOME)
    expect(bucketOf(filter, HOME)).toBe('neutral')
    expect(filter).toEqual(EMPTY_TAG_FILTER)
  })

  it('a tag is only ever in exactly one bucket at a time', () => {
    let filter = cycleTagInFilter(EMPTY_TAG_FILTER, HOME) // anyOf
    filter = cycleTagInFilter(filter, HOME) // allOf
    expect(filter.anyOf).not.toContain(HOME)
    expect(filter.noneOf).not.toContain(HOME)
    expect(filter.allOf).toContain(HOME)
  })

  it('cycling one tag does not disturb other tags already placed in buckets', () => {
    let filter: TagFilterState = { anyOf: [WORK], allOf: [CHORES], noneOf: [URGENT] }
    filter = cycleTagInFilter(filter, HOME) // HOME: neutral -> anyOf
    expect(filter).toEqual({ anyOf: [WORK, HOME], allOf: [CHORES], noneOf: [URGENT] })
  })
})

describe('removeTagFromFilter', () => {
  it('removes the tag from whichever bucket it is in', () => {
    expect(removeTagFromFilter({ anyOf: [HOME], allOf: [], noneOf: [] }, HOME)).toEqual(EMPTY_TAG_FILTER)
    expect(removeTagFromFilter({ anyOf: [], allOf: [HOME], noneOf: [] }, HOME)).toEqual(EMPTY_TAG_FILTER)
    expect(removeTagFromFilter({ anyOf: [], allOf: [], noneOf: [HOME] }, HOME)).toEqual(EMPTY_TAG_FILTER)
  })

  it('is a no-op if the tag is not present anywhere', () => {
    const filter: TagFilterState = { anyOf: [WORK], allOf: [], noneOf: [] }
    expect(removeTagFromFilter(filter, HOME)).toEqual(filter)
  })

  it('leaves other tags in the same bucket untouched', () => {
    const filter: TagFilterState = { anyOf: [HOME, WORK], allOf: [], noneOf: [] }
    expect(removeTagFromFilter(filter, HOME)).toEqual({ anyOf: [WORK], allOf: [], noneOf: [] })
  })
})
