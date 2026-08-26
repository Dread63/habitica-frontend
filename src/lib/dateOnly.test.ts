import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  addMonths,
  isSameDate,
  parseDateOnlyString,
  startOfDay,
  toApiDateTime,
  toDateOnlyString,
  today,
} from './dateOnly'

describe('today', () => {
  it('is local midnight', () => {
    const t = today()
    expect(t.getHours()).toBe(0)
    expect(t.getMinutes()).toBe(0)
    expect(t.getSeconds()).toBe(0)
    expect(t.getMilliseconds()).toBe(0)
  })
})

describe('startOfDay', () => {
  it('strips the time portion, keeping the calendar day', () => {
    const d = new Date(2026, 7, 17, 23, 59, 59)
    const stripped = startOfDay(d)
    expect(stripped.getFullYear()).toBe(2026)
    expect(stripped.getMonth()).toBe(7)
    expect(stripped.getDate()).toBe(17)
    expect(stripped.getHours()).toBe(0)
  })

  it('does not mutate its input', () => {
    const d = new Date(2026, 7, 17, 12, 0, 0)
    const original = d.getTime()
    startOfDay(d)
    expect(d.getTime()).toBe(original)
  })
})

describe('addDays', () => {
  it('adds days within a month', () => {
    const d = new Date(2026, 7, 17) // Aug 17
    expect(toDateOnlyString(addDays(d, 1))).toBe('2026-08-18')
    expect(toDateOnlyString(addDays(d, 7))).toBe('2026-08-24')
  })

  it('rolls over a month boundary', () => {
    const d = new Date(2026, 7, 28) // Aug 28
    expect(toDateOnlyString(addDays(d, 7))).toBe('2026-09-04')
  })

  it('rolls over a year boundary', () => {
    const d = new Date(2026, 11, 28) // Dec 28
    expect(toDateOnlyString(addDays(d, 7))).toBe('2027-01-04')
  })

  it('supports negative counts (subtracting days)', () => {
    const d = new Date(2026, 7, 1) // Aug 1
    expect(toDateOnlyString(addDays(d, -1))).toBe('2026-07-31')
  })

  it('does not mutate its input', () => {
    const d = new Date(2026, 7, 17)
    const original = d.getTime()
    addDays(d, 5)
    expect(d.getTime()).toBe(original)
  })
})

describe('addMonths', () => {
  it('adds/subtracts whole months, landing on the 1st', () => {
    const d = new Date(2026, 7, 17) // Aug 17
    expect(toDateOnlyString(addMonths(d, 1))).toBe('2026-09-01')
    expect(toDateOnlyString(addMonths(d, -1))).toBe('2026-07-01')
  })

  it('rolls over a year boundary', () => {
    const d = new Date(2026, 11, 15) // Dec 15
    expect(toDateOnlyString(addMonths(d, 1))).toBe('2027-01-01')
    expect(toDateOnlyString(addMonths(new Date(2026, 0, 15), -1))).toBe('2025-12-01')
  })

  it("doesn't overflow into the wrong month from a day that doesn't exist in the target month", () => {
    // Jan 31 + 1 month should land on Feb 1, not overflow to Mar 3.
    const d = new Date(2026, 0, 31)
    expect(toDateOnlyString(addMonths(d, 1))).toBe('2026-02-01')
  })
})

describe('isSameDate', () => {
  it('is true for the same calendar day at different times', () => {
    expect(isSameDate(new Date(2026, 7, 17, 3, 0), new Date(2026, 7, 17, 23, 59))).toBe(true)
  })

  it('is false for different days', () => {
    expect(isSameDate(new Date(2026, 7, 17), new Date(2026, 7, 18))).toBe(false)
  })
})

describe('toApiDateTime', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('converts local midnight to the matching UTC instant', () => {
    vi.stubEnv('TZ', 'America/Denver') // UTC-6 (MDT) in August
    const local = new Date(2026, 7, 18) // local midnight, Aug 18
    expect(toApiDateTime(local)).toBe('2026-08-18T06:00:00.000Z')
  })

  it('round-trips back to the same calendar day via a plain local Date read — the actual fix', () => {
    // This is the invariant that matters: whatever this app sends, reading
    // it back with plain `new Date(iso)` + local getters (no special UTC
    // handling — see taskDueDate.ts's getDueDate) must recover the exact
    // calendar day that was picked, for a viewer in the same timezone.
    for (const tz of ['America/Denver', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Tokyo', 'UTC']) {
      vi.stubEnv('TZ', tz)
      const picked = parseDateOnlyString('2026-08-18') as Date
      const sent = toApiDateTime(picked)
      const readBack = new Date(sent)
      expect(toDateOnlyString(readBack)).toBe('2026-08-18')
    }
  })
})

describe('toDateOnlyString / parseDateOnlyString round-trip', () => {
  it('round-trips a normal date', () => {
    const d = new Date(2026, 7, 17)
    expect(toDateOnlyString(d)).toBe('2026-08-17')
    expect(parseDateOnlyString('2026-08-17')).toEqual(d)
  })

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5) // Jan 5
    expect(toDateOnlyString(d)).toBe('2026-01-05')
  })

  it('parses to local midnight, not UTC midnight — the actual bug this module exists to prevent', () => {
    const parsed = parseDateOnlyString('2026-08-18')
    expect(parsed).not.toBeNull()
    // A local-midnight Date's getHours() is always 0, regardless of the
    // runner's timezone — new Date('2026-08-18') (UTC parse) would only
    // satisfy this incidentally in the UTC timezone.
    expect(parsed?.getHours()).toBe(0)
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(7)
    expect(parsed?.getDate()).toBe(18)
  })
})

describe('parseDateOnlyString', () => {
  it('rejects malformed input', () => {
    expect(parseDateOnlyString('')).toBeNull()
    expect(parseDateOnlyString('not-a-date')).toBeNull()
    expect(parseDateOnlyString('2026-8-17')).toBeNull() // unpadded
    expect(parseDateOnlyString('08/17/2026')).toBeNull()
  })

  it('rejects a calendar date that does not exist, rather than silently rolling it over', () => {
    expect(parseDateOnlyString('2026-02-30')).toBeNull() // no such day
    expect(parseDateOnlyString('2026-13-01')).toBeNull() // no such month
    expect(parseDateOnlyString('2026-04-31')).toBeNull() // April has 30 days
  })

  it('accepts a real leap day', () => {
    expect(parseDateOnlyString('2028-02-29')).not.toBeNull() // 2028 is a leap year
  })

  it('rejects Feb 29 in a non-leap year', () => {
    expect(parseDateOnlyString('2026-02-29')).toBeNull()
  })
})
