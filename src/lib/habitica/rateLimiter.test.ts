import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RateLimiter } from './rateLimiter'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests up to the limit without waiting', async () => {
    const limiter = new RateLimiter(3, 1000)
    const order: number[] = []

    await Promise.all([
      limiter.acquire().then(() => order.push(1)),
      limiter.acquire().then(() => order.push(2)),
      limiter.acquire().then(() => order.push(3)),
    ])

    expect(order).toEqual([1, 2, 3])
  })

  it('queues the (limit+1)th request until the window has room', async () => {
    const limiter = new RateLimiter(2, 1000)

    await limiter.acquire()
    await limiter.acquire()

    let resolved = false
    const pending = limiter.acquire().then(() => {
      resolved = true
    })

    // Still inside the 1s window — must not have resolved yet.
    await vi.advanceTimersByTimeAsync(500)
    expect(resolved).toBe(false)

    // Past the window (with the limiter's small buffer) — now it should.
    await vi.advanceTimersByTimeAsync(600)
    await pending
    expect(resolved).toBe(true)
  })

  it('serves concurrent callers in call order, not all-at-once', async () => {
    const limiter = new RateLimiter(1, 1000)
    const order: number[] = []

    await limiter.acquire() // fills the only slot

    const second = limiter.acquire().then(() => order.push('second' as unknown as number))
    const third = limiter.acquire().then(() => order.push('third' as unknown as number))

    await vi.advanceTimersByTimeAsync(1005)
    await second
    await vi.advanceTimersByTimeAsync(1005)
    await third

    expect(order).toEqual(['second', 'third'])
  })

  it('cooldown() delays the next acquire() by the given duration', async () => {
    const limiter = new RateLimiter(30, 60_000)
    await limiter.acquire()

    void limiter.cooldown(2000)

    let resolved = false
    const pending = limiter.acquire().then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1100)
    await pending
    expect(resolved).toBe(true)
  })
})
