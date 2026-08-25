import { describe, expect, it } from 'vitest'
import {
  combineDateAndTime,
  formatMinutesOfDay,
  hhmmToEndMinutes,
  hhmmToMinutes,
  minutesFromDate,
  minutesToHHMM,
  MINUTES_PER_DAY,
} from './timeOfDay'

describe('hhmmToEndMinutes', () => {
  it('accepts 24:00 as end-of-day, which the plain parser rejects', () => {
    expect(hhmmToEndMinutes('24:00')).toBe(MINUTES_PER_DAY)
    expect(hhmmToMinutes('24:00')).toBeNull()
  })

  it('otherwise behaves exactly like hhmmToMinutes', () => {
    expect(hhmmToEndMinutes('09:30')).toBe(570)
    expect(hhmmToEndMinutes('24:01')).toBeNull()
    expect(hhmmToEndMinutes('25:00')).toBeNull()
    expect(hhmmToEndMinutes('nonsense')).toBeNull()
  })
})

describe('hhmmToMinutes', () => {
  it('parses well-formed times', () => {
    expect(hhmmToMinutes('00:00')).toBe(0)
    expect(hhmmToMinutes('09:30')).toBe(570)
    expect(hhmmToMinutes('9:30')).toBe(570) // single-digit hour is fine
    expect(hhmmToMinutes('23:59')).toBe(1439)
  })

  it('rejects malformed or out-of-range values', () => {
    expect(hhmmToMinutes('')).toBeNull()
    expect(hhmmToMinutes('25:00')).toBeNull()
    expect(hhmmToMinutes('12:60')).toBeNull()
    expect(hhmmToMinutes('9:5')).toBeNull() // one-digit minutes: rejected, not guessed
    expect(hhmmToMinutes('12.30')).toBeNull()
    expect(hhmmToMinutes('noon')).toBeNull()
  })

  it('round-trips through minutesToHHMM', () => {
    for (const m of [0, 1, 59, 60, 570, 720, 1439]) {
      expect(hhmmToMinutes(minutesToHHMM(m))).toBe(m)
    }
  })
})

describe('minutesToHHMM', () => {
  it('zero-pads both fields', () => {
    expect(minutesToHHMM(0)).toBe('00:00')
    expect(minutesToHHMM(65)).toBe('01:05')
    expect(minutesToHHMM(1439)).toBe('23:59')
  })
})

describe('formatMinutesOfDay', () => {
  it('uses a 12-hour clock with correct noon/midnight handling', () => {
    expect(formatMinutesOfDay(0)).toBe('12:00 AM')
    expect(formatMinutesOfDay(570)).toBe('9:30 AM')
    expect(formatMinutesOfDay(720)).toBe('12:00 PM')
    expect(formatMinutesOfDay(1439)).toBe('11:59 PM')
    expect(formatMinutesOfDay(1440)).toBe('12:00 AM') // a block ending exactly at midnight
  })
})

describe('combineDateAndTime', () => {
  it('produces a local instant on the given day', () => {
    const d = combineDateAndTime(new Date(2026, 7, 25), '09:30')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(7)
    expect(d!.getDate()).toBe(25)
    expect(d!.getHours()).toBe(9)
    expect(d!.getMinutes()).toBe(30)
  })

  it('lands on the intended wall-clock time on a DST-transition day', () => {
    // 2026-03-08 is the US spring-forward date; setHours (not ms math)
    // means we ask for 9:30 local and get 9:30 local regardless of the
    // zone the test runs in.
    const d = combineDateAndTime(new Date(2026, 2, 8), '09:30')
    expect(d!.getHours()).toBe(9)
    expect(d!.getMinutes()).toBe(30)
    expect(d!.getDate()).toBe(8)
  })

  it('returns null for a malformed time', () => {
    expect(combineDateAndTime(new Date(), '25:00')).toBeNull()
  })
})

describe('minutesFromDate', () => {
  it('reads local hours/minutes', () => {
    expect(minutesFromDate(new Date(2026, 0, 1, 0, 0))).toBe(0)
    expect(minutesFromDate(new Date(2026, 0, 1, 12, 0))).toBe(720)
    expect(minutesFromDate(new Date(2026, 0, 1, 23, 59))).toBe(1439)
  })
})
