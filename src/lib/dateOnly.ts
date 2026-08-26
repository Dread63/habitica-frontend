/**
 * Timezone-safe calendar-date helpers — "calendar date" meaning a plain
 * Y-M-D with no time-of-day or timezone attached, the concept behind
 * `<input type="date">` and this app's own date picker/quick-add/drag-drop.
 *
 * Everything except `toApiDateTime` (see its own comment) works in the
 * *viewer's local* calendar and deliberately avoids `Date.parse()`/`new
 * Date(dateOnlyString)` on a bare "YYYY-MM-DD" — that's parsed as *UTC*
 * midnight per the ECMAScript spec, a different instant than local midnight
 * everywhere except UTC+0. `toDateOnlyString`/`parseDateOnlyString` are the
 * one pair of functions allowed to touch a "YYYY-MM-DD" string directly;
 * every other date computation in this app goes through a `Date` object.
 */

/** Local midnight, today. */
export function today(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Local midnight for the given date (strips the time portion). */
export function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * Adds (or, with a negative count, subtracts) whole days using the local
 * calendar — via `setDate`, not raw millisecond math, so it lands on the
 * correct day across a DST transition (a naive `+ n * 86400000` can land an
 * hour off on the one or two days a year the clocks change).
 */
export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

/**
 * Adds (or subtracts) whole calendar months via `setMonth` — used for
 * DatePicker's month navigation. Deliberately clamps to the 1st of the
 * target month first: `setMonth` on, say, Jan 31 stepping forward one
 * month overflows into March (Feb has no 31st) instead of landing on Feb
 * 28th, which would be a visibly wrong month to land the calendar view on.
 */
export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), 1)
  copy.setMonth(copy.getMonth() + months)
  return copy
}

/** True when both dates fall on the same calendar day (ignores time-of-day). */
export function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * "YYYY-MM-DD" from a Date's *local* Y/M/D — the format both
 * `<input type="date">` and Habitica's todo `date` field expect on the way
 * in. Built from local getters + manual padding, not `toISOString().slice`,
 * since that converts to UTC first and would reintroduce the same
 * off-by-one this module exists to avoid.
 */
export function toDateOnlyString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * The inverse of `toDateOnlyString` — parses "YYYY-MM-DD" into a Date at
 * *local* midnight for that calendar day. Deliberately not `new
 * Date(dateOnlyString)`: per the ECMAScript spec, a date-only ISO string is
 * parsed as UTC midnight, which is a different instant than local midnight
 * everywhere except UTC+0 — splitting the string and using the
 * year/month/day `Date` constructor (which is always local) sidesteps that
 * entirely. Returns `null` for anything that isn't a well-formed
 * "YYYY-MM-DD" (and for genuinely invalid calendar dates like "2026-02-30"
 * — `Date` would otherwise silently roll it over into March).
 */
export function parseDateOnlyString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  // Date rolls an out-of-range day/month over into the next one instead of
  // erroring (e.g. month 13 -> January of next year) — reading the
  // components back and comparing catches that instead of silently
  // accepting a nonsense date.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

/**
 * The one deliberate exception to "avoid toISOString" above — this is
 * specifically for talking to the Habitica API's `date` field, and the
 * fix for a real, confirmed bug found by a user cross-checking a task
 * created via this app's quick-add against habitica.com's own UI: the due
 * date was wrong *there*, not just in this app, which means the bug was in
 * what got *sent*, not how it was read back.
 *
 * An earlier version of this app sent a bare "YYYY-MM-DD" string, which
 * Habitica's server parses as literal UTC midnight — self-consistent as
 * long as this app was also the one reading it back with matching UTC-
 * aware logic, but wrong relative to habitica.com's own frontend, which
 * (like any ordinary JS date picker, and like this function) sends a real
 * timestamp for *local* midnight of the intended day, and reads it back
 * with plain local `Date` methods. Two apps disagreeing about what a
 * "date" *is* is worse than either app being internally wrong — this
 * function makes this app match Habitica's own convention instead of a
 * self-consistent one that happened to be incompatible with it.
 *
 * `date` should already be local midnight (from `parseDateOnlyString`,
 * `today()`, `addDays`, or a `CalendarGrid` selection) — `toISOString()`
 * converts it to the equivalent UTC instant, which is exactly what a
 * `Date`-typed API field expects.
 */
export function toApiDateTime(date: Date): string {
  return date.toISOString()
}
