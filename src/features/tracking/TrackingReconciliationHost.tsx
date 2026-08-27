import * as React from 'react'
import { AlarmClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, type DialogHandle } from '@/components/ui/dialog'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { usePomodoroStore } from '@/features/pomodoro/pomodoroStore'
import { formatDuration } from './trackingStats'
import { entryDurationMs, entryEndMs, type TimeEntry } from './timeEntries'
import { useTimeEntryStore } from './timeEntryStore'
import { useHeartbeatStore } from './heartbeatStore'
import {
  entriesNeedingReview,
  HEARTBEAT_INTERVAL_MS,
  resolveReconcileChoice,
  type ReconcileChoice,
} from './reconciliation'

const CHECK_INTERVAL_MS = 60_000

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Asks about time the app recorded but nobody witnessed — see
 * reconciliation.ts for why the heartbeat, not a bare timeout, is the signal.
 *
 * Mounted **once** in App.tsx beside ConfirmDialogHost. Not in PomodoroPanel:
 * that is mounted twice simultaneously and StrictMode doubles effects again,
 * so the heartbeat would tick four times and the prompt could open twice.
 *
 * Deliberately not `confirmDialog()` — that's boolean-only, and this needs
 * five options plus a number input.
 */
export function TrackingReconciliationHost() {
  const entries = useTimeEntryStore((s) => s.entries)
  const { edit, remove } = useTimeEntryStore()
  const phases = usePomodoroStore((s) => s.phases)
  const lastSeenAt = useHeartbeatStore((s) => s.lastSeenAt)
  const beat = useHeartbeatStore((s) => s.beat)

  const dialogRef = React.useRef<DialogHandle>(null)
  const [pending, setPending] = React.useState<TimeEntry | null>(null)
  const [customMinutes, setCustomMinutes] = React.useState('')

  // The heartbeat itself. NOT gated on visibility: a backgrounded tab while
  // you work is exactly the case that must NOT look like absence.
  React.useEffect(() => {
    beat()
    const id = window.setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [beat])

  // Check on mount, on tab focus, and slowly thereafter. Reads the heartbeat
  // from the store rather than the subscription so the value can't be the one
  // this component just wrote.
  const check = React.useCallback(() => {
    if (dialogRef.current === null) return
    setPending((current) => {
      if (current) return current
      const seenAt = useHeartbeatStore.getState().lastSeenAt
      const [next] = entriesNeedingReview(useTimeEntryStore.getState().entries, seenAt, new Date())
      return next ?? null
    })
  }, [])

  React.useEffect(() => {
    check()
    const id = window.setInterval(check, CHECK_INTERVAL_MS)
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // `entries` is in the deps so a newly-suspicious entry is noticed without
    // waiting a full minute.
  }, [check, entries])

  React.useEffect(() => {
    if (pending) {
      setCustomMinutes(String(Math.max(1, Math.round((lastSeenAt - Date.parse(pending.startedAt)) / 60_000))))
      dialogRef.current?.open()
    }
  }, [pending, lastSeenAt])

  const titleRef = useTwemoji<HTMLParagraphElement>([pending?.taskSnapshot.text])

  function apply(choice: ReconcileChoice) {
    if (!pending) return
    const result = resolveReconcileChoice(pending, choice, lastSeenAt, new Date())
    if ('discard' in result) {
      remove(pending.id)
    } else {
      // `closedBy: 'reconciled'` rather than an audit entry: the end time was
      // reconstructed, not misstated. Marking it as an edit would overclaim,
      // and hiding it entirely would underclaim.
      edit(pending.id, { endedAt: result.endedAt })
      useTimeEntryStore.setState((state) => ({
        entries: state.entries.map((e) =>
          e.id === pending.id
            ? { ...e, closedBy: 'reconciled' as const, reviewedAt: new Date().toISOString(), audit: undefined }
            : e,
        ),
      }))
    }
    setPending(null)
    dialogRef.current?.close()
  }

  const now = new Date()
  const startedAt = pending ? Date.parse(pending.startedAt) : 0
  const untilHeartbeatMs = pending ? Math.max(0, Math.min(lastSeenAt, entryEndMs(pending, now)) - startedAt) : 0
  const fullMs = pending ? entryDurationMs(pending, now) : 0
  // Only offered when the phase genuinely ended before the entry did.
  const phase = pending?.phaseId ? phases.find((p) => p.id === pending.phaseId) : undefined
  const phaseEndMs = phase ? Date.parse(phase.endedAt) : null
  const phaseOption = phaseEndMs !== null && phaseEndMs > startedAt && phaseEndMs < entryEndMs(pending!, now)

  return (
    <Dialog
      ref={dialogRef}
      title="Were you there the whole time?"
      icon={<AlarmClock className="size-4 text-primary" aria-hidden="true" />}
      onClose={() => setPending(null)}
    >
      {pending && (
        <div className="flex flex-col gap-3">
          <p ref={titleRef} className="text-sm">
            <span className="font-medium">{emojify(pending.taskSnapshot.text)}</span> has been tracking since{' '}
            {clockTime(startedAt)}.
          </p>
          <p className="text-xs text-muted-foreground">
            This device was last awake at {clockTime(lastSeenAt)}. Time after that was recorded by the clock, but
            nothing here can vouch for it — so it's worth confirming rather than quietly counting.
          </p>

          <div className="flex flex-col gap-2">
            <Button type="button" size="sm" onClick={() => apply({ kind: 'keepUntilLastSeen' })}>
              Keep until {clockTime(lastSeenAt)} ({formatDuration(untilHeartbeatMs)})
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => apply({ kind: 'keepAll' })}>
              Keep all of it ({formatDuration(fullMs)})
            </Button>
            {phaseOption && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => apply({ kind: 'keepPhase', endedAt: phase!.endedAt })}
              >
                Keep just the focus block ({formatDuration(phaseEndMs! - startedAt)})
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                aria-label="Minutes to keep"
                className="h-8 w-24"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => apply({ kind: 'keepMinutes', minutes: Math.max(1, Number(customMinutes) || 1) })}
              >
                Keep that many minutes
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => apply({ kind: 'discard' })}
            >
              Discard this interval
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
