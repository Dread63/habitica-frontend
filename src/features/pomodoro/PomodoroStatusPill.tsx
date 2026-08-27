import * as React from 'react'
import { BellRing, Timer } from 'lucide-react'
import type { DialogHandle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { remainingMs } from './pomodoroEngine'
import { usePomodoroStore } from './pomodoroStore'
import { openEntryOf } from '@/features/tracking/timeEntries'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { alertPhaseComplete } from './pomodoroNotify'
import { PomodoroDialog } from './PomodoroDialog'

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

/**
 * Don't chime/notify for a phase that ended long ago — reopening the app the
 * next morning shouldn't announce yesterday's last pomodoro. Normal
 * detection latency is a second (foreground tick) to a minute (background
 * throttling), so this window is generous.
 */
const ALERT_STALENESS_MS = 5 * 60_000

/**
 * The one always-mounted pomodoro component (rendered in App's nav strip),
 * and therefore the owner of the authoritative clock loop: a 1s advance()
 * tick while running, an immediate advance() when the tab regains
 * visibility, and one on mount (which is what rolls a persisted running
 * session forward after a full page reload). Everything else — the dialog,
 * the panels — is just a view over the store this keeps current.
 *
 * It also owns the phase-end alert, for the same reason: advance() is where
 * a completion is detected, and the store deliberately doesn't play sounds
 * or touch the Notification API itself (effects live in components here).
 *
 * Self-contained like TaskCard with its editor: owns the PomodoroDialog via
 * a local ref, no prop drilling through App.
 */
export function PomodoroStatusPill() {
  const run = usePomodoroStore((s) => s.run)
  const settings = usePomodoroStore((s) => s.settings)
  const advance = usePomodoroStore((s) => s.advance)
  const dialogRef = React.useRef<DialogHandle>(null)
  const [, setTick] = React.useState(0)

  const tickAndAlert = React.useCallback(() => {
    const completed = advance()
    setTick((t) => t + 1)
    if (completed === null) return
    if (Date.now() - new Date(completed.endedAt).getTime() > ALERT_STALENESS_MS) return
    // Read the post-advance state for the phase now waiting to be started.
    const { run: nextRun, settings: current } = usePomodoroStore.getState()
    alertPhaseComplete(completed.phase, nextRun.phase, {
      sound: current.soundEnabled,
      notifications: current.notificationsEnabled,
    })
  }, [advance])

  React.useEffect(() => {
    tickAndAlert() // reload/mount catch-up for a persisted running session
  }, [tickAndAlert])

  React.useEffect(() => {
    if (run.status !== 'running') return
    const id = window.setInterval(tickAndAlert, 1000)
    return () => window.clearInterval(id)
  }, [run.status, tickAndAlert])

  React.useEffect(() => {
    function onVisibilityChange() {
      if (!document.hidden) tickAndAlert()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [tickAndAlert])

  const isActive = run.status !== 'idle'
  const isAwaiting = run.status === 'awaiting'
  // The pointer, not the timer, answers "what am I on" — so this stays
  // accurate while tracking outside a pomodoro, a state that could not
  // previously exist.
  const openEntry = useTimeEntryStore((s) => openEntryOf(s.entries))
  const taskSummary = openEntry?.taskSnapshot.text ?? null
  const taskRef = useTwemoji<HTMLSpanElement>([taskSummary])
  // Tracking with no timer running: worth showing, but quietly.
  const trackingOnly = !isActive && openEntry !== undefined

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.open()}
        aria-label={
          isAwaiting
            ? 'Open pomodoro timer (phase finished, waiting to start the next one)'
            : isActive
              ? 'Open pomodoro timer (session active)'
              : 'Open pomodoro timer'
        }
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
          isAwaiting
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : trackingOnly
              ? 'bg-primary/10 text-primary hover:bg-primary/20'
              : isActive
              ? run.phase === 'work'
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'bg-muted text-foreground hover:bg-muted/80'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {isAwaiting ? <BellRing className="size-4" /> : <Timer className="size-4" />}
        {isAwaiting ? (
          // The seam is an action, not a countdown — say so rather than
          // showing a frozen clock the user might read as "still running".
          <span>Start {run.phase === 'work' ? 'focus' : 'break'}</span>
        ) : isActive ? (
          <>
            <span className="tabular-nums">{formatCountdown(remainingMs(run, settings, new Date()))}</span>
            {run.status === 'paused' && <span className="text-xs opacity-70">paused</span>}
            {taskSummary && (
              <span ref={taskRef} className="hidden max-w-36 truncate text-xs opacity-70 sm:inline">
                {emojify(taskSummary)}
              </span>
            )}
          </>
        ) : trackingOnly ? (
          <span ref={taskRef} className="hidden max-w-36 truncate text-xs sm:inline">
            {emojify(taskSummary ?? '')}
          </span>
        ) : (
          <span className="hidden sm:inline">Pomodoro</span>
        )}
      </button>
      <PomodoroDialog ref={dialogRef} />
    </>
  )
}
