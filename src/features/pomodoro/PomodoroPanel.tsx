import * as React from 'react'
import { Pause, Play, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { today, toDateOnlyString } from '@/lib/dateOnly'
import { minutesFromDate } from '@/lib/timeOfDay'
import { useTasks } from '@/features/tasks/useTasks'
import { isSchedulableTaskType } from '@/features/tasks/taskType'
import { entriesForDate, focusCandidateEntries } from '@/features/timeline/timelineEntries'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import { phaseDurationMinutes, remainingMs, type PomodoroPhase, type PomodoroTaskRef } from './pomodoroEngine'
import { usePomodoroStore } from './pomodoroStore'
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

/** The phase that just finished, inferred from the one we're now parked on
 * — enough to caption the seam without storing a second phase field. */
function finishedPhaseOf(nextPhase: PomodoroPhase): PomodoroPhase {
  return nextPhase === 'work' ? 'shortBreak' : 'work'
}

/**
 * The pomodoro control surface: a live donut countdown, the linked-task
 * chips, and start/pause/stop. Rendered in two places — the Timeline page's
 * rail (the "leave it open on a monitor" view) and the pomodoro dialog's
 * Timer tab — one component, so the two can't drift apart.
 *
 * Phases never advance on their own. When one runs out the timer parks in
 * `awaiting` (see pomodoroEngine.ts) and this panel becomes a prompt —
 * "Focus complete · Start short break" — until you press start. A break that
 * begins without you noticing isn't a break, and an auto-started next focus
 * block quietly poisons time attribution with minutes you weren't there for.
 *
 * When idle, the focus task is auto-picked from the timeline: whatever's
 * live right now, else the next upcoming block today (currentOrNextEntry).
 * The pick is a *suggestion* — editing the queue takes over until the next
 * session ends. Sessions can link several tasks (chips), added or removed
 * mid-session too; the linked set is the fallback attribution target for any
 * focus time the timeline doesn't cover (see focusAttribution.ts).
 */
export function PomodoroPanel() {
  const run = usePomodoroStore((s) => s.run)
  const settings = usePomodoroStore((s) => s.settings)
  const { startSession, setSessionTasks, pauseSession, resumeSession, startNextPhase, stopSession } =
    usePomodoroStore()
  const entries = useTimelineEntryStore((s) => s.entries)
  const tasksQuery = useTasks()

  // Display tick only — the authoritative advance() loop lives in
  // PomodoroStatusPill, which is always mounted.
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (run.status !== 'running') return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [run.status])

  const isIdle = run.status === 'idle'
  const isAwaiting = run.status === 'awaiting'
  const focusableTasks = React.useMemo(
    () => (tasksQuery.data ?? []).filter((t) => isSchedulableTaskType(t.type)),
    [tasksQuery.data],
  )
  const tasksById = React.useMemo(() => new Map(focusableTasks.map((t) => [t.id, t])), [focusableTasks])

  // The timeline suggestion is shown whenever the *next thing to start* is a
  // focus phase and the user hasn't hand-picked the chips: idle, and also at
  // an awaiting-work seam — that's the moment the old set went stale (you
  // finished the task, ticked it off, scheduled its successor), and it's
  // exactly what startNextPhase will write in when you press start.
  const showsSuggestion = (isIdle || (isAwaiting && run.phase === 'work')) && !run.tasksPinned

  // Keep the suggestion current on the fly: entry-store changes already
  // re-render (subscription above), but time passing alone doesn't — so tick
  // whenever a suggestion is on screen (30s + tab-refocus), or a block that
  // just went live would sit unnoticed until some other state change.
  React.useEffect(() => {
    if (!showsSuggestion) return
    const refresh = () => setTick((t) => t + 1)
    const id = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [showsSuggestion])

  // null = follow the timeline suggestion; an array = the user took over.
  const [queue, setQueue] = React.useState<PomodoroTaskRef[] | null>(null)
  const nowMinutes = minutesFromDate(new Date())
  const dayEntries = showsSuggestion ? entriesForDate(entries, toDateOnlyString(today())) : []
  // Blocks live now plus blocks starting before the session would end,
  // falling back to the next upcoming one — minus anything already finished.
  const suggestedEntries = showsSuggestion
    ? focusCandidateEntries(dayEntries, nowMinutes, settings.workMinutes)
    : []
  const suggestionIsLive = suggestedEntries.some((e) => e.startMinutes <= nowMinutes)
  const suggestedRefs: PomodoroTaskRef[] = []
  for (const e of suggestedEntries) {
    // Live task first, the entry's snapshot second — so a block whose task
    // Habitica no longer returns still resolves to a name and its tags.
    const live = tasksById.get(e.taskId)
    const ref = live
      ? { id: live.id, text: live.text, tagIds: live.tags }
      : e.taskSnapshot
        ? { id: e.taskId, text: e.taskSnapshot.text, tagIds: e.taskSnapshot.tagIds }
        : null
    if (ref && !suggestedRefs.some((r) => r.id === ref.id)) suggestedRefs.push(ref)
  }

  const idleQueue: PomodoroTaskRef[] = queue ?? suggestedRefs
  const linkedTasks = showsSuggestion ? idleQueue : run.tasks

  const chipsRef = useTwemoji<HTMLDivElement>([linkedTasks.map((t) => t.text).join('|')])

  const totalMs = phaseDurationMinutes(run.phase, settings) * 60_000
  const remaining = isIdle ? settings.workMinutes * 60_000 : remainingMs(run, settings, new Date())
  const progress = isIdle || isAwaiting ? 0 : Math.min(1 - remaining / totalMs, 1)
  const ringColor = isIdle ? 'var(--primary)' : PHASE_COLORS[run.phase]
  const seam = isAwaiting ? phaseSeamMessage(finishedPhaseOf(run.phase), run.phase) : null

  // Chip edits go to local state while idle (there's no run to write to) and
  // to the store otherwise — including at a suggestion seam, where they have
  // to *pin* the set or startNextPhase would overwrite it from the timeline.
  function commitTasks(tasks: PomodoroTaskRef[]) {
    if (isIdle) setQueue(tasks)
    else setSessionTasks(tasks)
  }

  function addTask(taskId: string) {
    const task = tasksById.get(taskId)
    if (!task) return
    if (linkedTasks.some((t) => t.id === task.id)) return
    commitTasks([...linkedTasks, { id: task.id, text: task.text, tagIds: task.tags }])
  }

  function removeTask(taskId: string) {
    commitTasks(linkedTasks.filter((t) => t.id !== taskId))
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4">
      {/* The donut: a full muted track with a progress arc that fills as the
          phase elapses, animated linearly between 1s ticks. */}
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

      {/* The phase seam. Deliberately loud enough to notice on a glance from
          across the room — it's the one state that needs an action. */}
      {seam && (
        <div className="w-full rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-center">
          <p className="text-sm font-medium text-primary">{seam.title}</p>
          <p className="text-xs text-muted-foreground">{seam.body}</p>
        </div>
      )}

      {/* Linked tasks — chips, removable, addable mid-session too. */}
      <div ref={chipsRef} className="flex w-full flex-wrap items-center justify-center gap-1.5">
        {linkedTasks.length === 0 && <span className="text-xs text-muted-foreground">Untracked focus</span>}
        {linkedTasks.map((t) => (
          <span
            key={t.id}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs"
          >
            <span className="truncate">{emojify(t.text)}</span>
            <button
              type="button"
              aria-label={`Unlink ${t.text}`}
              onClick={() => removeTask(t.id)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      {showsSuggestion && (isIdle ? queue === null : true) && suggestedRefs.length > 0 && (
        <p className="-mt-2 text-[11px] text-muted-foreground/80">
          Auto-picked from your timeline · {suggestionIsLive ? 'in this focus window' : 'up next'}
        </p>
      )}

      <Select
        aria-label="Link a task to this focus session"
        value=""
        onChange={(e) => {
          if (e.target.value) addTask(e.target.value)
        }}
        className="h-8 text-xs"
      >
        <option value="">Link a task…</option>
        {focusableTasks
          .filter((t) => !linkedTasks.some((l) => l.id === t.id))
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
              // timer callback minutes later, and browsers ignore a
              // permission request that isn't gesture-initiated. Asking here
              // (once, only if notifications are on and undecided) beats
              // burying it behind a Settings tab nobody opens.
              primeAudio()
              if (settings.notificationsEnabled && notificationPermission() === 'default') {
                void requestNotificationPermission()
              }
              // A queue the user edited is pinned for the session; the bare
              // timeline suggestion isn't, so later focus phases re-derive it.
              startSession(idleQueue, queue !== null)
              setQueue(null) // next idle state re-follows the timeline suggestion
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
