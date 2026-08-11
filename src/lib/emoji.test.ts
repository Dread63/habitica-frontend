import { describe, expect, it } from 'vitest'
import { emojify } from './emoji'

describe('emojify', () => {
  it('converts a known shortcode to its Unicode character', () => {
    expect(emojify('Buy :tomato:')).toBe('Buy 🍅')
  })

  it('converts multiple shortcodes in one string', () => {
    expect(emojify(':tomato: and :apple:')).toBe('🍅 and 🍎')
  })

  it('leaves an unrecognized shortcode as literal text', () => {
    expect(emojify('Not a real one: :definitely-not-an-emoji:')).toBe('Not a real one: :definitely-not-an-emoji:')
  })

  it('leaves plain text with no shortcodes untouched', () => {
    expect(emojify('Buy groceries')).toBe('Buy groceries')
  })
})
