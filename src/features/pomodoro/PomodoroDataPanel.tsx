import * as React from 'react'
import { CloudOff, Cloud, Download, HardDrive, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { downloadExport } from '@/lib/sync/syncClient'
import { useFocusSyncStore, type SyncStatus } from '@/lib/sync/focusSyncStore'
import { usePomodoroStore } from './pomodoroStore'
import { completedPomodoros } from './pomodoroPhases'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'

const STATUS_COPY: Record<SyncStatus, { label: string; detail: string }> = {
  unknown: { label: 'Checking…', detail: 'Looking for a sync service alongside this app.' },
  unavailable: {
    label: 'This device only',
    detail:
      'No sync service is running alongside this app, so your timeline and focus history live in this browser only. Deploy the api container to share them across devices.',
  },
  idle: { label: 'Synced', detail: 'Your timeline and focus history are stored on the server.' },
  syncing: { label: 'Syncing…', detail: 'Sending changes and pulling anything new.' },
  offline: {
    label: 'Offline — changes saved locally',
    detail: 'The server is unreachable. Everything still works; changes upload on the next successful sync.',
  },
  error: { label: 'Sync problem', detail: 'The last sync failed. Changes are safe in this browser.' },
}

function relativeTime(ms: number): string {
  const seconds = Math.round((Date.now() - ms) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} hr ago`
  return new Date(ms).toLocaleDateString()
}

/**
 * Where the focus data lives, and how to get it out.
 *
 * The export buttons hit the server rather than serialising from local state
 * on purpose: the server holds the union of every device, so a laptop that
 * only ever saw half your sessions still downloads the complete log.
 */
export function PomodoroDataPanel() {
  const { credentials } = useAuth()
  const { status, lastSyncedAt, lastError } = useFocusSyncStore()
  const entryCount = useTimeEntryStore((s) => s.entries.length)
  const pomodoroCount = usePomodoroStore((s) => completedPomodoros(s.phases).length)
  const placementCount = useTimelineEntryStore((s) => s.entries.length)
  const [busy, setBusy] = React.useState<'csv' | 'json' | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)

  const online = status === 'idle' || status === 'syncing'
  const copy = STATUS_COPY[status]

  async function handleExport(format: 'csv' | 'json') {
    if (!credentials) return
    setBusy(format)
    setFailure(null)
    try {
      await downloadExport(credentials.userId, format)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-border p-3">
        {online ? (
          <Cloud className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        ) : status === 'unavailable' ? (
          <HardDrive className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <CloudOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {copy.label}
            {status === 'idle' && lastSyncedAt !== null && (
              <span className="font-normal text-muted-foreground"> · {relativeTime(lastSyncedAt)}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{copy.detail}</p>
          {lastError && status !== 'idle' && (
            <p className="mt-1 text-[11px] text-muted-foreground/70">{lastError}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{entryCount}</p>
          <p className="text-xs text-muted-foreground">Tracked intervals</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{pomodoroCount}</p>
          <p className="text-xs text-muted-foreground">Pomodoros completed</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{placementCount}</p>
          <p className="text-xs text-muted-foreground">Timeline placements</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">Export your focus log</span>
        <p className="text-xs text-muted-foreground">
          The CSV is one row per tracked interval — real start and end times, minutes, task, and categories — so
          summing the minutes column by category or by task gives exact totals. It opens in any spreadsheet and
          doesn't depend on this app still existing. The JSON is a complete backup that can be restored here.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!online || busy !== null}
            onClick={() => void handleExport('csv')}
          >
            <Download className={cn('size-4', busy === 'csv' && 'animate-pulse')} /> Download CSV
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!online || busy !== null}
            onClick={() => void handleExport('json')}
          >
            <Download className={cn('size-4', busy === 'json' && 'animate-pulse')} /> Download JSON backup
          </Button>
          {!online && (
            <span className="text-xs text-muted-foreground">
              <RefreshCw className="mr-1 inline size-3" />
              Exports come from the server, so they need it reachable.
            </span>
          )}
        </div>
        {failure && <p className="text-xs text-destructive">Export failed: {failure}</p>}
      </div>
    </div>
  )
}
