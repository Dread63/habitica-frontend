import { describe, it, expect } from 'vitest'
import { parseQuickAdd } from './quickAdd'

describe('parseQuickAdd', () => {
  it('plain text with no tokens becomes a todo, easy, no tags', () => {
    expect(parseQuickAdd('Water plants')).toEqual({
      text: 'Water plants',
      type: 'todo',
      priority: 1,
      tagNames: [],
    })
  })

  describe('tags (#)', () => {
    it('parses a single tag', () => {
      const result = parseQuickAdd('Buy milk #errands')
      expect(result.text).toBe('Buy milk')
      expect(result.tagNames).toEqual(['errands'])
    })

    it('parses multiple tags in any position', () => {
      const result = parseQuickAdd('#home Buy milk #errands')
      expect(result.text).toBe('Buy milk')
      expect(result.tagNames).toEqual(['home', 'errands'])
    })

    it('supports hyphens and underscores in tag names', () => {
      expect(parseQuickAdd('Task #home-chores #a_b').tagNames).toEqual(['home-chores', 'a_b'])
    })

    it('does not treat a mid-word # as a tag marker', () => {
      const result = parseQuickAdd('Room#42 needs cleaning')
      expect(result.tagNames).toEqual([])
      expect(result.text).toBe('Room#42 needs cleaning')
    })

    describe('quoted tags — the fix for tag names with spaces (e.g. "Life + Admin")', () => {
      it('parses a quoted multi-word tag', () => {
        const result = parseQuickAdd('Pay rent #"Life + Admin"')
        expect(result.text).toBe('Pay rent')
        expect(result.tagNames).toEqual(['Life + Admin'])
      })

      it('mixes quoted and bare tags in one input', () => {
        const result = parseQuickAdd('Pay rent #"Life + Admin" #urgent')
        expect(result.text).toBe('Pay rent')
        expect(result.tagNames).toEqual(['Life + Admin', 'urgent'])
      })

      it('a quoted tag can appear anywhere in the input', () => {
        const result = parseQuickAdd('#"Life + Admin" Pay rent')
        expect(result.text).toBe('Pay rent')
        expect(result.tagNames).toEqual(['Life + Admin'])
      })

      it('preserves internal punctuation/spacing exactly as typed', () => {
        expect(parseQuickAdd('Task #"a, b & c"').tagNames).toEqual(['a, b & c'])
      })

      it('an unterminated quote is left as literal text, not guessed at', () => {
        const result = parseQuickAdd('Pay rent #"Life + Admin')
        expect(result.tagNames).toEqual([])
        expect(result.text).toBe('Pay rent #"Life + Admin')
      })

      it('an empty quoted tag (#"") is not parsed as a token', () => {
        const result = parseQuickAdd('Task #""')
        expect(result.tagNames).toEqual([])
        expect(result.text).toBe('Task #""')
      })
    })
  })

  describe('type (/)', () => {
    it.each([
      ['/habit', 'habit'],
      ['/daily', 'daily'],
      ['/todo', 'todo'],
      ['/reward', 'reward'],
    ] as const)('%s -> type %s', (token, expected) => {
      expect(parseQuickAdd(`Meditate ${token}`).type).toBe(expected)
    })

    it('is case-insensitive', () => {
      expect(parseQuickAdd('Meditate /HABIT').type).toBe('habit')
      expect(parseQuickAdd('Meditate /Habit').type).toBe('habit')
    })

    it('strips the token from the text', () => {
      expect(parseQuickAdd('Meditate /habit daily').text).toBe('Meditate daily')
    })

    it('defaults to todo when omitted', () => {
      expect(parseQuickAdd('Buy milk').type).toBe('todo')
    })

    it('an unrecognized /word is left in the text, not silently dropped', () => {
      const result = parseQuickAdd('Fix the a/b test')
      expect(result.type).toBe('todo')
      expect(result.text).toBe('Fix the a/b test')
    })

    it('last /type token wins if more than one is present', () => {
      expect(parseQuickAdd('Task /habit /daily').type).toBe('daily')
    })
  })

  describe('difficulty (!, !!, ~)', () => {
    it('~ is trivial (0.1)', () => {
      expect(parseQuickAdd('Quick task ~').priority).toBe(0.1)
    })

    it('! is medium (1.5)', () => {
      expect(parseQuickAdd('Task !').priority).toBe(1.5)
    })

    it('!! is hard (2)', () => {
      expect(parseQuickAdd('Task !!').priority).toBe(2)
    })

    it('defaults to easy (1) when omitted', () => {
      expect(parseQuickAdd('Task').priority).toBe(1)
    })

    it('strips the token from the text', () => {
      expect(parseQuickAdd('Finish report !!').text).toBe('Finish report')
    })

    it('does not treat a trailing ! glued to a word as a difficulty marker', () => {
      const result = parseQuickAdd('Reply to urgent emails!')
      expect(result.priority).toBe(1)
      expect(result.text).toBe('Reply to urgent emails!')
    })

    it('a leading ! glued to the next word is not a marker either', () => {
      const result = parseQuickAdd('!Important meeting notes')
      expect(result.priority).toBe(1)
      expect(result.text).toBe('!Important meeting notes')
    })
  })

  describe('combinations', () => {
    it('tags + type + difficulty together, in the order from the design discussion', () => {
      const result = parseQuickAdd('Buy milk #errands #home /todo !!')
      expect(result).toEqual({
        text: 'Buy milk',
        type: 'todo',
        priority: 2,
        tagNames: ['errands', 'home'],
      })
    })

    it('tokens interspersed throughout the text', () => {
      const result = parseQuickAdd('Meditate /habit #wellness')
      expect(result).toEqual({
        text: 'Meditate',
        type: 'habit',
        priority: 1,
        tagNames: ['wellness'],
      })
    })

    it('collapses extra whitespace left behind after stripping tokens', () => {
      const result = parseQuickAdd('Call   mom   #family   !')
      expect(result.text).toBe('Call mom')
      expect(result.tagNames).toEqual(['family'])
      expect(result.priority).toBe(1.5)
    })
  })

  it('empty input produces empty text (caller is responsible for rejecting it)', () => {
    expect(parseQuickAdd('').text).toBe('')
    expect(parseQuickAdd('   ').text).toBe('')
  })

  describe('date tokens (@)', () => {
    // Wednesday, 2026-08-12 — a fixed reference point so every relative
    // form below (@tomorrow, @friday, a bare @M/D) is deterministic.
    const NOW = new Date(2026, 7, 12)

    it('@today resolves to the reference date', () => {
      expect(parseQuickAdd('Pay rent @today', NOW).date).toBe('2026-08-12')
    })

    it('@tomorrow resolves to one day ahead', () => {
      expect(parseQuickAdd('Pay rent @tomorrow', NOW).date).toBe('2026-08-13')
    })

    it('strips the token from the text', () => {
      expect(parseQuickAdd('Pay rent @tomorrow', NOW).text).toBe('Pay rent')
    })

    it('is case-insensitive', () => {
      expect(parseQuickAdd('Pay rent @TOMORROW', NOW).date).toBe('2026-08-13')
      expect(parseQuickAdd('Pay rent @Friday', NOW).date).toBe('2026-08-14')
    })

    describe('weekday names', () => {
      it('resolves to the next occurrence, inclusive of today', () => {
        // NOW is a Wednesday — naming Wednesday itself means today, not a
        // week from now (matches Todoist's convention for the same ambiguity).
        expect(parseQuickAdd('Task @wednesday', NOW).date).toBe('2026-08-12')
        expect(parseQuickAdd('Task @wed', NOW).date).toBe('2026-08-12')
      })

      it('resolves to the upcoming occurrence for a day later in the week', () => {
        expect(parseQuickAdd('Task @friday', NOW).date).toBe('2026-08-14')
        expect(parseQuickAdd('Task @fri', NOW).date).toBe('2026-08-14')
      })

      it('wraps to next week for a day earlier in the week', () => {
        // Monday has already passed this week as of Wednesday — next
        // Monday is 5 days out, not -2.
        expect(parseQuickAdd('Task @monday', NOW).date).toBe('2026-08-17')
      })

      it('accepts full names and common abbreviations', () => {
        expect(parseQuickAdd('Task @sat', NOW).date).toBe('2026-08-15')
        expect(parseQuickAdd('Task @saturday', NOW).date).toBe('2026-08-15')
      })
    })

    describe('explicit M/D dates', () => {
      it('assumes the current year when omitted, if the date is still upcoming', () => {
        expect(parseQuickAdd('Task @12/25', NOW).date).toBe('2026-12-25')
      })

      it('rolls to next year when the bare date has already passed this year', () => {
        expect(parseQuickAdd('Task @1/5', NOW).date).toBe('2027-01-05')
      })

      it('does not roll forward a bare date that is exactly today', () => {
        expect(parseQuickAdd('Task @8/12', NOW).date).toBe('2026-08-12')
      })

      it('accepts a 2-digit year', () => {
        expect(parseQuickAdd('Task @8/11/26', NOW).date).toBe('2026-08-11')
        expect(parseQuickAdd('Task @8/11/99', NOW).date).toBe('2099-08-11')
      })

      it('accepts a 4-digit year', () => {
        expect(parseQuickAdd('Task @8/11/2026', NOW).date).toBe('2026-08-11')
      })

      it('an explicit year is never rolled forward, even if already past', () => {
        expect(parseQuickAdd('Task @1/1/2020', NOW).date).toBe('2020-01-01')
      })
    })

    it('an unrecognized @word is left in the text, not silently dropped', () => {
      const result = parseQuickAdd('Task @someone about this', NOW)
      expect(result.date).toBeUndefined()
      expect(result.text).toBe('Task @someone about this')
    })

    it('an @ glued mid-word (e.g. an email address) is never mistaken for a token', () => {
      const result = parseQuickAdd('Email me@example.com about this', NOW)
      expect(result.date).toBeUndefined()
      expect(result.text).toBe('Email me@example.com about this')
    })

    it('rejects a nonsensical calendar date rather than guessing', () => {
      const result = parseQuickAdd('Task @2/30', NOW)
      expect(result.date).toBeUndefined()
      expect(result.text).toBe('Task @2/30')
    })

    it('last @date token wins if more than one is present', () => {
      expect(parseQuickAdd('Task @monday @friday', NOW).date).toBe('2026-08-14')
    })

    it('is absent from the result entirely when no @token is present', () => {
      expect(parseQuickAdd('Plain task', NOW)).not.toHaveProperty('date')
    })

    it('composes with tags, type, and difficulty', () => {
      expect(parseQuickAdd('Renew registration @friday #errands /todo !', NOW)).toEqual({
        text: 'Renew registration',
        type: 'todo',
        priority: 1.5,
        tagNames: ['errands'],
        date: '2026-08-14',
      })
    })
  })
})
