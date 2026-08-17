import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDueDate, getDueDate, isOverdue, sortTasksByDueDate } from './taskDueDate'
import { parseDateOnlyString, toApiDateTime, today } from '@/lib/dateOnly'
import type { DailyTask, HabitTask, RewardTask, TodoTask } from '@/lib/habitica/types'

function todo(overrides: Partial<TodoTask> = {}): TodoTask {
  return {
    id: 't1',
    _id: 't1',
    type: 'todo',
    text: 'todo',
    notes: '',
    tags: [],
    value: 0,
    priority: 1,
    attribute: 'str',
    challenge: {},
    group: {},
    reminders: [],
    createdAt: '',
    updatedAt: '',
    completed: false,
    collapseChecklist: false,
    checklist: [],
    ...overrides,
  }
}

function daily(overrides: Partial<DailyTask> = {}): DailyTask {
  return {
    id: 'd1',
    _id: 'd1',
    type: 'daily',
    text: 'daily',
    notes: '',
    tags: [],
    value: 0,
    priority: 1,
    attribute: 'str',
    challenge: {},
    group: {},
    reminders: [],
    createdAt: '',
    updatedAt: '',
    frequency: 'daily',
    everyX: 1,
    startDate: '',
    repeat: { m: true, t: true, w: true, th: true, f: true, s: true, su: true },
    streak: 0,
    daysOfMonth: [],
    weeksOfMonth: [],
    yesterDaily: true,
    completed: false,
    collapseChecklist: false,
    checklist: [],
    history: [],
    ...overrides,
  }
}

function habit(overrides: Partial<HabitTask> = {}): HabitTask {
  return {
    id: 'h1',
    _id: 'h1',
    type: 'habit',
    text: 'habit',
    notes: '',
    tags: [],
    value: 0,
    priority: 1,
    attribute: 'str',
    challenge: {},
    group: {},
    reminders: [],
    createdAt: '',
    updatedAt: '',
    up: true,
    down: true,
    counterUp: 0,
    counterDown: 0,
    frequency: 'daily',
    history: [],
    ...overrides,
  }
}

function reward(overrides: Partial<RewardTask> = {}): RewardTask {
  return {
    id: 'r1',
    _id: 'r1',
    type: 'reward',
    text: 'reward',
    notes: '',
    tags: [],
    value: 10,
    priority: 1,
    attribute: 'str',
    challenge: {},
    group: {},
    reminders: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('getDueDate', () => {
  it("is null for a todo with no due date", () => {
    expect(getDueDate(todo())).toBeNull()
  })

  it("reads a todo's due date from `date`", () => {
    const due = getDueDate(todo({ date: '2026-08-18T00:00:00.000Z' }))
    expect(due?.toISOString()).toBe('2026-08-18T00:00:00.000Z')
  })

  it("reads a daily's next occurrence from nextDue[0]", () => {
    expect(getDueDate(daily({ nextDue: ['2026-08-20T00:00:00.000Z', '2026-08-21T00:00:00.000Z'] }))?.toISOString()).toBe(
      '2026-08-20T00:00:00.000Z',
    )
  })

  it('is null for a daily with an empty/missing nextDue', () => {
    expect(getDueDate(daily({ nextDue: [] }))).toBeNull()
    expect(getDueDate(daily())).toBeNull()
  })

  it('is always null for habits and rewards', () => {
    expect(getDueDate(habit())).toBeNull()
    expect(getDueDate(reward())).toBeNull()
  })

  describe('write/read round-trip — the fix for a real, confirmed bug', () => {
    // The bug wasn't in reading a todo's `date` back — it was in what got
    // sent in the first place. A bare "YYYY-MM-DD" string (what this app
    // used to send) is parsed by Habitica as literal UTC midnight, which
    // habitica.com's own frontend then displays a day early for anyone
    // west of UTC — confirmed by a user cross-checking a task created via
    // this app's quick-add against habitica.com itself. The fix
    // (`toApiDateTime` in lib/dateOnly.ts) sends a real UTC instant for
    // *local* midnight instead, matching what an ordinary date picker (and
    // habitica.com's own) sends. This round-trips `toApiDateTime` into
    // `getDueDate` across several real timezones and confirms the
    // calendar day picked is the calendar day recovered — the thing that
    // actually matters, more than any single function's internals.
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it.each(['America/Denver', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Tokyo', 'UTC'])(
      'round-trips the picked calendar day correctly (%s)',
      (tz) => {
        vi.stubEnv('TZ', tz)
        const picked = parseDateOnlyString('2026-08-18')
        expect(picked).not.toBeNull()
        const apiValue = toApiDateTime(picked as Date)

        const due = getDueDate(todo({ date: apiValue }))
        expect(due).not.toBeNull()
        expect(due?.getFullYear()).toBe(2026)
        expect(due?.getMonth()).toBe(7) // August, 0-indexed
        expect(due?.getDate()).toBe(18)
      },
    )

    it('formats as the correct day for a viewer behind UTC — the exact scenario reported', () => {
      vi.stubEnv('TZ', 'America/Denver')
      const apiValue = toApiDateTime(parseDateOnlyString('2026-08-18') as Date)
      const due = getDueDate(todo({ date: apiValue }))
      expect(formatDueDate(due as Date)).toBe('Aug 18')
    })
  })
})

describe('isOverdue', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Denver')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is true for a clearly past-due, incomplete todo', () => {
    expect(isOverdue(todo({ date: '2000-01-01T00:00:00.000Z' }))).toBe(true)
  })

  it('is false once the todo is completed, even if past-due', () => {
    expect(isOverdue(todo({ date: '2000-01-01T00:00:00.000Z', completed: true }))).toBe(false)
  })

  it('is false for a todo with no due date', () => {
    expect(isOverdue(todo())).toBe(false)
  })

  it('is false for a todo due today — not overdue until the day has fully passed', () => {
    // Whatever hour it actually is when this test runs, "due today" must
    // never read as overdue — this is the compounding half of the bug:
    // the old raw-timestamp comparison flagged a same-day task as overdue
    // the moment the clock passed midnight. toApiDateTime(today()), not a
    // hand-built UTC-midnight string — that's what this app actually sends.
    expect(isOverdue(todo({ date: toApiDateTime(today()) }))).toBe(false)
  })

  it('is never true for dailies — a due-but-not-done daily is expected, not overdue', () => {
    expect(isOverdue(daily({ nextDue: ['2000-01-01T00:00:00.000Z'] }))).toBe(false)
  })
})

describe('sortTasksByDueDate', () => {
  it('sorts ascending by due date', () => {
    const later = todo({ id: 'a', date: '2026-09-01T00:00:00.000Z' })
    const sooner = todo({ id: 'b', date: '2026-08-01T00:00:00.000Z' })
    expect(sortTasksByDueDate([later, sooner]).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('pushes due-less tasks to the end, not the start', () => {
    const dated = todo({ id: 'dated', date: '2026-08-01T00:00:00.000Z' })
    const undated = todo({ id: 'undated' })
    expect(sortTasksByDueDate([undated, dated]).map((t) => t.id)).toEqual(['dated', 'undated'])
  })

  it('keeps relative order for ties (stable sort) — e.g. two tasks with no due date', () => {
    const a = todo({ id: 'a' })
    const b = todo({ id: 'b' })
    expect(sortTasksByDueDate([a, b]).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const input = [todo({ id: 'a', date: '2026-09-01T00:00:00.000Z' }), todo({ id: 'b', date: '2026-08-01T00:00:00.000Z' })]
    const original = [...input]
    sortTasksByDueDate(input)
    expect(input).toEqual(original)
  })
})
