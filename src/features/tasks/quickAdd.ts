import type { TaskPriority, TaskType } from '@/lib/habitica/types'
import { addDays, startOfDay, toDateOnlyString } from '@/lib/dateOnly'

export interface ParsedQuickAdd {
  text: string
  type: TaskType
  priority: TaskPriority
  tagNames: string[]
  /** "YYYY-MM-DD", parsed from an `@`-token — see `resolveDateToken`. Only meaningful for
   * todos server-side (Habitica ignores `date` for other types), but parsing doesn't need to
   * know the resolved `type` to extract it — QuickAddBar decides what to do with it. */
  date?: string
}

const TYPE_TOKENS: Record<string, TaskType> = {
  habit: 'habit',
  daily: 'daily',
  todo: 'todo',
  reward: 'reward',
}

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
}

/**
 * Resolves an `@`-token's raw text (whatever followed the `@`, not yet
 * validated) to a "YYYY-MM-DD" string, or null if it isn't a recognized
 * date form — null means "leave this token as literal text", same
 * treatment an unrecognized `/word` gets.
 *
 * Recognized forms: `@today`, `@tomorrow`, a weekday name/abbreviation
 * (`@friday`, `@fri` — resolves to the *next* occurrence, inclusive of
 * today: naming today's own weekday means today, not a week from now,
 * matching how e.g. Todoist resolves the same ambiguity), or an explicit
 * `@M/D`, `@M/D/YY`, or `@M/D/YYYY`. A bare `@M/D` with no year assumes the
 * current year *unless* that date has already passed, in which case it
 * rolls to next year — typing "@1/5" in December almost certainly means
 * next January, not 11 months ago.
 */
function resolveDateToken(raw: string, now: Date): string | null {
  const lower = raw.toLowerCase()
  if (lower === 'today') return toDateOnlyString(now)
  if (lower === 'tomorrow') return toDateOnlyString(addDays(now, 1))
  if (lower in WEEKDAY_NAMES) {
    const target = WEEKDAY_NAMES[lower]
    const daysAhead = (target - now.getDay() + 7) % 7
    return toDateOnlyString(addDays(now, daysAhead))
  }

  const explicit = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(raw)
  if (!explicit) return null
  const month = Number(explicit[1])
  const day = Number(explicit[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const hasYear = explicit[3] !== undefined
  const year = hasYear ? (Number(explicit[3]) < 100 ? 2000 + Number(explicit[3]) : Number(explicit[3])) : now.getFullYear()

  let candidate = new Date(year, month - 1, day)
  // Reject a date that doesn't actually exist (e.g. "2/30") rather than
  // silently accepting whatever Date rolled it over into.
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null

  if (!hasYear && candidate.getTime() < startOfDay(now).getTime()) {
    candidate = new Date(year + 1, month - 1, day)
  }

  return toDateOnlyString(candidate)
}

// Lead: string-start or a whitespace char (captured so it can be dropped
// along with the token, avoiding a doubled space where it was removed).
// Token, in order: #"quoted multi-word tag", #bare-tag, /type, @date, or a
// bare !!/!/~. Lookahead requires the token be followed by whitespace or
// string-end, so symbols glued to an ordinary word (e.g. the trailing "!"
// in "emails!") are never mistaken for markers.
const TOKEN_PATTERN = /(^|\s)(#"([^"]+)"|#([a-zA-Z0-9_-]+)|\/(\w+)|@(\S+)|!!|!|~)(?=\s|$)/g

/**
 * Parses the quick-add bar's shorthand — design settled with the user
 * before implementation (see CLAUDE.md/implementation-plan.md §6a):
 *   #tag           repeatable, becomes a tag (created on the fly if it
 *                  doesn't already exist — see QuickAddBar's resolveTagIds).
 *                  Bare form is alphanumeric/underscore/hyphen only, no
 *                  spaces — that's a real limitation for tags like
 *                  "Life + Admin", so...
 *   #"tag name"    ...quote a tag name that has spaces or other characters
 *                  the bare form doesn't allow. Either form can repeat.
 *   /type          habit | daily | todo | reward, case-insensitive;
 *                  defaults to todo if omitted
 *   @date          `@today`, `@tomorrow`, a weekday name (`@friday`), or an
 *                  explicit `@8/11`/`@8/11/26`/`@8/11/2026` — see
 *                  `resolveDateToken`. Only meaningful for todos, but
 *                  parsed regardless of type; QuickAddBar decides whether
 *                  to send it.
 *   !!             hard, !  medium, ~  trivial; defaults to easy if omitted
 *
 * Whatever remains after stripping recognized tokens, whitespace collapsed,
 * is the task's text. An unrecognized `/word` (typo, or just a task title
 * that happens to contain a slash) is deliberately left in the text rather
 * than silently swallowed, and an unterminated `#"` (no closing quote) is
 * left as literal text too rather than guessing where it should end — see
 * quickAdd.test.ts. An unrecognized `@word` (not a date form) gets the same
 * treatment, for the same reason — a stray email-style `@handle` in a task
 * title shouldn't vanish.
 *
 * `now` is injected (defaulting to the real clock) rather than read
 * internally so `@tomorrow`/weekday/no-year-date resolution stays testable
 * — see quickAdd.test.ts's date-token tests.
 */
export function parseQuickAdd(input: string, now: Date = new Date()): ParsedQuickAdd {
  const tagNames: string[] = []
  let type: TaskType = 'todo'
  let priority: TaskPriority = 1
  let date: string | undefined

  const stripped = input.replace(
    TOKEN_PATTERN,
    (
      match: string,
      lead: string,
      whole: string,
      quotedTag: string | undefined,
      bareTag: string | undefined,
      typeWord: string | undefined,
      dateWord: string | undefined,
    ) => {
      if (quotedTag !== undefined) {
        tagNames.push(quotedTag)
        return lead
      }
      if (bareTag !== undefined) {
        tagNames.push(bareTag)
        return lead
      }
      if (typeWord !== undefined) {
        const normalized = typeWord.toLowerCase()
        if (normalized in TYPE_TOKENS) {
          type = TYPE_TOKENS[normalized]
          return lead
        }
        return match // unrecognized /word - not a type marker, leave as text
      }
      if (dateWord !== undefined) {
        const resolved = resolveDateToken(dateWord, now)
        if (resolved !== null) {
          date = resolved
          return lead
        }
        return match // unrecognized @word - not a date marker, leave as text
      }
      if (whole === '!!') {
        priority = 2
        return lead
      }
      if (whole === '!') {
        priority = 1.5
        return lead
      }
      if (whole === '~') {
        priority = 0.1
        return lead
      }
      return match
    },
  )

  return {
    text: stripped.replace(/\s+/g, ' ').trim(),
    type,
    priority,
    tagNames,
    ...(date !== undefined ? { date } : {}),
  }
}
