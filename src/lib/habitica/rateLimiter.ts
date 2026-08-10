function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sliding-window limiter matching Habitica's 30 requests / 60 seconds cap
 * (see docs/habitica-api.md § Rate limit). Callers await `acquire()`
 * immediately before sending a request; once the window is full, the call
 * waits instead of firing (and getting a 429).
 *
 * Concurrent callers are serialized through a promise chain (`queue`) so
 * they claim slots in call order rather than all re-reading the same
 * timestamp array and racing each other into the same slot.
 */
export class RateLimiter {
  private readonly limit: number
  private readonly windowMs: number
  private timestamps: number[] = []
  private queue: Promise<void> = Promise.resolve()

  constructor(limit = 30, windowMs = 60_000) {
    this.limit = limit
    this.windowMs = windowMs
  }

  acquire(): Promise<void> {
    const run = this.queue.then(() => this.waitForSlot())
    // Never let one failed waiter poison the chain for everyone after it.
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Force an extra cooldown before the next request — used after a 429. */
  cooldown(ms: number): Promise<void> {
    const run = this.queue.then(() => sleep(ms))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now()
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs)
      if (this.timestamps.length < this.limit) {
        this.timestamps.push(now)
        return
      }
      const oldest = this.timestamps[0]
      const waitMs = this.windowMs - (now - oldest) + 5 // small buffer past the window edge
      await sleep(waitMs)
    }
  }
}
