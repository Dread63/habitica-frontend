/**
 * Local time-of-day helpers — the sibling of dateOnly.ts for the *time* half
 * of a timestamp. dateOnly.ts deliberately models only calendar dates (its
 * whole point is avoiding UTC-vs-local day-boundary bugs); the timeline and
 * pomodoro features need minutes-since-local-midnight as well, so that
 * concept gets one home here rather than ad-hoc `h * 60 + m` math scattered
 * through components.
 *
 * Everything here is local-time only. None of this ever touches Habitica's
 * API (timeline/pomodoro state is app-local), so there is no `toApiDateTime`
 * equivalent and none should be added — see dateOnly.ts for why that
 * function is deliberately the one UTC exception in this codebase.
 */

export const MINUTES_PER_DAY = 24 * 60

/**
 * "HH:mm" (or "H:mm") -> minutes since midnight, or null for anything
 * malformed — same null-on-invalid convention as dateOnly.ts's
 * `parseDateOnlyString`. Minutes must be two digits ("9:5" is rejected, not
 * guessed at) and both fields must be in range.
 */
export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * `hhmmToMinutes` for an *end* time, where "24:00" is a real, meaningful
 * value (a block running to midnight) rather than an out-of-range hour.
 * Kept separate so the plain parser stays a strict wall-clock reader — a
 * start time of "24:00" is nonsense and should still be rejected.
 */
export function hhmmToEndMinutes(value: string): number | null {
  if (value.trim() === '24:00') return MINUTES_PER_DAY
  return hhmmToMinutes(value)
}

/** Inverse of `hhmmToMinutes` — always zero-padded "HH:mm". */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Display label, 12-hour clock: 0 -> "12:00 AM", 570 -> "9:30 AM". The
 * hour wraps mod 24 so an end-of-block value of exactly 1440 (midnight)
 * formats as "12:00 AM" instead of falling outside the clock. */
export function formatMinutesOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const suffix = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

/**
 * A local Date instant for the given calendar day + "HH:mm", or null if the
 * time is malformed. Built via setHours on a copy — not raw millisecond math
 * — so it lands on the intended wall-clock time even across a DST
 * transition (same reasoning as dateOnly.ts's `addDays` using `setDate`).
 */
export function combineDateAndTime(date: Date, hhmm: string): Date | null {
  const minutes = hhmmToMinutes(hhmm)
  if (minutes === null) return null
  const copy = new Date(date)
  copy.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return copy
}

/** Minutes since local midnight for a Date — drives the timeline's "now" line. */
export function minutesFromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}
