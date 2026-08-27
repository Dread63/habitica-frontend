import { describe, expect, it, afterEach, vi } from 'vitest'
import { randomId } from './randomId'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * The regression these guard: on the NAS the app is served over plain HTTP,
 * where `crypto.randomUUID` is undefined ([SecureContext]). Every one of
 * these paths has to still produce a usable id — the alternative is a
 * TypeError thrown inside a click handler, which the user experiences as the
 * button doing nothing at all.
 */
describe('randomId', () => {
  it('returns a v4 UUID when crypto.randomUUID exists (secure context)', () => {
    expect(randomId()).toMatch(UUID_V4)
  })

  it('still returns a v4 UUID when crypto.randomUUID is missing (plain-HTTP origin)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    expect(randomId()).toMatch(UUID_V4)
  })

  it('falls back to Math.random with no usable crypto at all', () => {
    vi.stubGlobal('crypto', undefined)
    expect(randomId()).toMatch(UUID_V4)
  })

  it('does not collide across many calls in the fallback path', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    const ids = new Set(Array.from({ length: 2000 }, () => randomId()))
    expect(ids.size).toBe(2000)
  })
})
