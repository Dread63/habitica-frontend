import * as React from 'react'
import { minutesFromDate } from '@/lib/timeOfDay'

/**
 * A re-render tick for anything that displays "now".
 *
 * Nothing here is state in any meaningful sense — the current time is always
 * derivable from the clock. This exists purely to *invalidate* a render at a
 * sensible cadence, which is why it deliberately doesn't hold a Date: holding
 * one would tempt callers to read it as the authoritative instant, and a
 * value that's up to 30 seconds stale is exactly the wrong thing to compute a
 * duration from. Callers call `new Date()` themselves; this just tells React
 * to look again.
 *
 * `visibilitychange` matters more than the interval: browsers throttle
 * background timers hard, so a tab returning to the foreground would
 * otherwise show a clock frozen at whenever it was backgrounded.
 */
const DEFAULT_INTERVAL_MS = 30_000

export function useNowTick(intervalMs: number = DEFAULT_INTERVAL_MS): number {
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    const id = window.setInterval(bump, intervalMs)
    document.addEventListener('visibilitychange', bump)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', bump)
    }
  }, [intervalMs])

  return tick
}

/**
 * Minutes since local midnight, re-read on each tick — the timeline
 * scrubber's now-line and the pomodoro panel's timeline suggestion both want
 * exactly this. Derived fresh on every render rather than stored, so it can't
 * lag behind the tick that caused the render.
 */
export function useNowMinutes(intervalMs: number = DEFAULT_INTERVAL_MS): number {
  useNowTick(intervalMs)
  return minutesFromDate(new Date())
}
