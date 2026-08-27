import * as React from 'react'
import { Circle, Pause, Play, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { useNowTick } from '@/lib/useNowTick'
import { useTasks } from '@/features/tasks/useTasks'
import { isSchedulableTaskType } from '@/features/tasks/taskType'
import { openEntryOf, entryDurationMs, taskRefOf } from '@/features/tracking/timeEntries'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { formatDuration } from '@/features/tracking/trackingStats'
import { phaseDurationMinutes, remainingMs, type PomodoroPhase } from './pomodoroEngine'
import { suggestedTaskRef, usePomodoroStore } from './pomodoroStore'
import { notificationPermission, phaseSeamMessage, primeAudio, requestNotificationPermission } from './pomodoroNotify'

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  work: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
}
/** Break ring goes green — "rest", visually distinct from the violet focus ring. */
const PHASE_COLORS: Record<PomodoroPhase, string> = {
  work: 'var(--primary)',
  shortBreak: '#34c98f',
  longBreak: '#34c98f',
}

const RING_R = 54
const RING_C = 2 * Math.PI * RING_R

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

/** The phase that just finished, inferred from the one we're now parked on. */
function finishedPhaseOf(nextPhase: PomodoroPhase): PomodoroPhase {
  return nextPhase === 'work' ? 'shortBreak' : 'work'
}

/**
 * The pomodoro control surface: a live donut countdown, the **Working on**
 * row, and start/pause/stop. Rendered in two places at once — the Timeline
 * page's rail and the dialog's Timer tab — so it must stay a pure view: it
 * never opens or closes a time entry from an effect, only from a click.
 *
 * Two clocks are shown side by side and that is correct, not a bug:
 *
 *   23:41 left in this focus block  ·  1h 12m on Write report
 *
 * The first is the timer's discipline; the second is how long you have
 * actually been on this task, which may span several phases and keeps running
 * past the bell. Collapsing them into one number is exactly what the old
 * model did, and why its figures could not be trusted.
 */
export function PomodoroPanel() {
  const run = usePomodoroStore((s) => s.run)
  const settings = usePomodoroStore((s) => s.settings)
  const { startSession, pauseSession, resumeSession, startNextPhase, stopSession } = usePomodoroStore()
  const entries = useTimeEntryStore((s) => s.entries)
  const { start: startTracking, stop: stopTracking } = useTimeEntryStore()
  const tasksQuery = useTasks()

  // Display tick only — the authoritative advance() loop lives in
  // PomodoroStatusPill, which is always mounted exactly once.
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (run.status !== 'running') return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [run.status])
  // Keeps the "on this task" duration and the timeline suggestion current
  // even when the timer isn't running.
  useNowTick(30_000)

  const isIdle = run.status === 'idle'
  const isAwaiting = run.status === 'awaiting'
  const now = new Date()

  const focusableTasks = React.useMemo(
    () => (tasksQuery.data ?? []).filter((t) => isSchedulableTaskType(t.type)),
    [tasksQuery.data],
  )

  const open = openEntryOf(entries)
  const openTaskText = open?.taskSnapshot.text ?? null
  const openDurationMs = open ? entryDurationMs(open, now) : 0
  const workingRef = useTwemoji<HTMLSpanElement>([openTaskText])

  // Only offered when nothing is tracked — never as a nag, and never applied
  // behind the user's back.
  const suggestion = open ? null : suggestedTaskRef(now, settings.workMinutes)

  const totalMs = phaseDurationMinutes(run.phase, settings) * 60_000
  const remaining = isIdle ? settings.workMinutes * 60_000 : remainingMs(run, settings, now)
  const progress = isIdle || isAwaiting ? 0 : Math.min(1 - remaining / totalMs, 1)
  const ringColor = isIdle ? 'var(--primary)' : PHASE_COLORS[run.phase]
  const seam = isAwaiting ? phaseSeamMessage(finishedPhaseOf(run.phase), run.phase) : null

  function handleSelectTask(taskId: string) {
    const task = focusableTasks.find((t) => t.id === taskId)
    if (task) startTracking(taskRefOf(task))
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className="relative">
        <svg viewBox="0 0 120 120" className="size-40 -rotate-90">
          <circle cx="60" cy="60" r={RING_R} fill="none" stroke="var(--muted)" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r={RING_R}
            fill="none"
            stroke={ringColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className={cn('text-3xl font-semibold tabular-nums', (isIdle || isAwaiting) && 'text-muted-foreground')}>
            {formatCountdown(remaining)}
          </p>
          <p className="text-xs text-muted-foreground">
            {isIdle ? 'ready' : isAwaiting ? `${PHASE_LABELS[run.phase].toLowerCase()} ready` : PHASE_LABELS[run.phase]}
            {run.status === 'paused' && ' · paused'}
          </p>
          {!isIdle && !isAwaiting && run.phase === 'work' && (
            <p className="text-[10px] text-muted-foreground/70">
              session {run.sessionsCompletedInCycle + 1}/{settings.sessionsBeforeLongBreak}
            </p>
          )}
        </div>
      </div>

      {seam && (
        <div className="w-full rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-center">
          <p className="text-sm font-medium text-primary">{seam.title}</p>
          <p className="text-xs text-muted-foreground">{seam.body}</p>
        </div>
      )}

      {/* Working on — the pointer. One task, always; switching is one click. */}
      <div className="w-full rounded-md border border-border px-3 py-2">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Working on</p>
        {open ? (
          <div className="mt-1 flex items-center gap-2">
            <Circle
              className="size-2 shrink-0 animate-pulse fill-primary text-primary"
              aria-label="tracking"
            />
            <span ref={workingRef} className="min-w-0 flex-1 truncate text-sm font-medium">
              {emojify(openTaskText ?? '')}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatDuration(openDurationMs)}
            </span>
            <button
              type="button"
              aria-label="Stop tracking"
              title="Stop tracking"
              onClick={() => stopTracking('user')}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Not tracking</span>
            {suggestion && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto h-7"
                onClick={() => startTracking(suggestion)}
              >
                Start “{suggestion.text}”
              </Button>
            )}
          </div>
        )}
      </div>

      <Select
        aria-label={open ? 'Switch to another task' : 'Start tracking a task'}
        value=""
        onChange={(e) => {
          if (e.target.value) handleSelectTask(e.target.value)
        }}
        className="h-8 text-xs"
      >
        <option value="">{open ? 'Switch task…' : 'Start tracking…'}</option>
        {focusableTasks
          .filter((t) => t.id !== open?.taskId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {emojify(t.text)}
            </option>
          ))}
      </Select>

      <div className="flex items-center gap-2">
        {isIdle ? (
          <Button
            type="button"
            onClick={() => {
              // Both alert channels have to be armed from a user gesture, and
              // this click is the only one in reach — the chime fires from a
              // timer callback minutes later.
              primeAudio()
              if (settings.notificationsEnabled && notificationPermission() === 'default') {
                void requestNotificationPermission()
              }
              startSession()
            }}
          >
            <Play className="size-4" /> Start focus
          </Button>
        ) : isAwaiting ? (
          <>
            <Button type="button" onClick={startNextPhase}>
              <Play className="size-4" /> Start {PHASE_LABELS[run.phase].toLowerCase()}
            </Button>
            <Button type="button" variant="ghost" onClick={stopSession} className="text-muted-foreground">
              <Square className="size-4" /> End session
            </Button>
          </>
        ) : (
          <>
            {run.status === 'running' ? (
              <Button type="button" variant="outline" onClick={pauseSession}>
                <Pause className="size-4" /> Pause
              </Button>
            ) : (
              <Button type="button" onClick={resumeSession}>
                <Play className="size-4" /> Resume
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={stopSession} className="text-destructive">
              <Square className="size-4" /> Stop
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
