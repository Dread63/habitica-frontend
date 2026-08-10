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
})
