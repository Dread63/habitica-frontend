import * as React from 'react'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import { liveFocusSession, type PomodoroSessionRecord } from './pomodoroStats'
import { usePomodoroStore } from './pomodoroStore'

/**
 * How often the in-progress preview recomputes. Everything it feeds is
 * displayed in whole minutes, so a second-by-second tick would burn renders
 * to change nothing — but it has to be well under a minute, or the numbers
 * visibly lag the clock.
 */
const TICK_MS = 15_000

/**
 * The provisional record for the focus phase in flight, refreshed on a
 * timer so stats surfaces move while you work.
 *
 * Without this, every stat reads `history`, which is written only when a
 * phase ends — so "Where the time went" and the category bars sat frozen for
 * the entire 25 minutes of a session and only jumped at the seam. Callers
 * merge the result into the day's sessions and mark it as in-progress.
 *
 * Returns null whenever there's nothing in flight, so `sessions.concat(live
 * ?? [])` is the whole integration at each call site.
 */
export function useLiveFocusSession(): PomodoroSessionRecord | null {
  const run = usePomodoroStore((s) => s.run)
  const entries = useTimelineEntryStore((s) => s.entries)
  const [, setTick] = React.useState(0)

  // Only tick while the clock is actually running: a paused phase's elapsed
  // time is frozen by construction, so recomputing it would be pure waste.
  const isRunning = run.status === 'running' && run.phase === 'work'
  React.useEffect(() => {
    if (!isRunning) return
    const refresh = () => setTick((t) => t + 1)
    const id = window.setInterval(refresh, TICK_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [isRunning])

  // Recomputed every render — it depends on `now`, so memoizing on the
  // inputs alone would defeat the tick above.
  return liveFocusSession(run, entries, new Date())
}
