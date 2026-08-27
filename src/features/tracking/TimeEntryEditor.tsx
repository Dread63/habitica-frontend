import * as React from 'react'
import { Scissors, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, type DialogHandle } from '@/components/ui/dialog'
import { combineDateAndTime, hhmmToMinutes, minutesToHHMM } from '@/lib/timeOfDay'
import { useTasks } from '@/features/tasks/useTasks'
import { isSchedulableTaskType } from '@/features/tasks/taskType'
import { emojify } from '@/lib/emoji'
import {
  entryDurationMs,
  isOpen,
  timeEntrySnapshotOf,
  MIN_ENTRY_MS,
  type TimeEntry,
} from './timeEntries'
import { useTimeEntryStore } from './timeEntryStore'
import { formatDuration } from './trackingStats'

/** Local "HH:mm" for an instant. */
function hhmmOf(iso: string): string {
  const d = new Date(iso)
  return minutesToHHMM(d.getHours() * 60 + d.getMinutes())
}

/**
 * Correcting a recorded interval — you will forget to switch tasks, and a log
 * you can't fix is a log you stop trusting.
 *
 * Every change routes through `editEntry`, which captures the original values
 * on the **first** edit and never overwrites them. So the record keeps saying
 * what was captured live alongside what you corrected it to, and the CSV
 * exports both. That distinction is what lets the log stand as evidence
 * rather than just as data.
 */
export function TimeEntryEditor({ entry, onClose }: { entry: TimeEntry; onClose: () => void }) {
  const dialogRef = React.useRef<DialogHandle>(null)
  const { edit, split, remove } = useTimeEntryStore()
  const tasksQuery = useTasks()

  const [taskId, setTaskId] = React.useState(entry.taskId)
  const [start, setStart] = React.useState(() => hhmmOf(entry.startedAt))
  const [end, setEnd] = React.useState(() => (entry.endedAt ? hhmmOf(entry.endedAt) : ''))
  const [splitAt, setSplitAt] = React.useState('')

  React.useEffect(() => {
    dialogRef.current?.open()
  }, [])

  const day = new Date(entry.startedAt)
  const startInstant = combineDateAndTime(day, start)
  const endInstant = end ? combineDateAndTime(day, end) : null
  const startInvalid = startInstant === null
  // An open entry may legitimately have no end; a closed one must keep a
  // sane, forward-running interval.
  const endInvalid =
    !isOpen(entry) && (endInstant === null || endInstant.getTime() - (startInstant?.getTime() ?? 0) < MIN_ENTRY_MS)

  const tasks = (tasksQuery.data ?? []).filter((t) => isSchedulableTaskType(t.type))
  const splitMinutes = hhmmToMinutes(splitAt)
  const splitInstant = splitMinutes === null ? null : combineDateAndTime(day, splitAt)

  function handleSave() {
    if (startInvalid || endInvalid) return
    const task = tasks.find((t) => t.id === taskId)
    edit(entry.id, {
      taskId,
      taskSnapshot: task ? timeEntrySnapshotOf(task) : entry.taskSnapshot,
      startedAt: startInstant!.toISOString(),
      ...(isOpen(entry) && !endInstant ? {} : { endedAt: endInstant!.toISOString() }),
    })
    dialogRef.current?.close()
  }

  return (
    <Dialog ref={dialogRef} title="Edit interval" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Task</span>
          <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {/* The recorded task may no longer exist; keep it selectable so a
                deleted task's time doesn't silently get reassigned. */}
            {!tasks.some((t) => t.id === entry.taskId) && (
              <option value={entry.taskId}>{emojify(entry.taskSnapshot.text)} (deleted)</option>
            )}
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {emojify(t.text)}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Start (24h)</span>
            <Input
              value={start}
              onChange={(e) => setStart(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="HH:mm"
              inputMode="numeric"
              aria-invalid={startInvalid}
              className={startInvalid ? 'border-destructive' : undefined}
            />
          </label>
          <span className="pb-2 text-xs text-muted-foreground">to</span>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">End</span>
            <Input
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder={isOpen(entry) ? 'still running' : 'HH:mm'}
              inputMode="numeric"
              aria-invalid={endInvalid}
              className={endInvalid ? 'border-destructive' : undefined}
            />
          </label>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {startInvalid || endInvalid
            ? 'Times must be HH:mm, and the end at least a few seconds after the start.'
            : `Currently ${formatDuration(entryDurationMs(entry, new Date()))}.`}
          {entry.audit && (
            <>
              {' '}
              Originally {hhmmOf(entry.audit.original.startedAt)}
              {entry.audit.original.endedAt ? `–${hhmmOf(entry.audit.original.endedAt)}` : ''}; edited{' '}
              {entry.audit.editCount} {entry.audit.editCount === 1 ? 'time' : 'times'}.
            </>
          )}
        </p>

        {!isOpen(entry) && (
          <div className="flex items-end gap-2 border-t border-border pt-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Split at</span>
              <Input
                value={splitAt}
                onChange={(e) => setSplitAt(e.target.value)}
                placeholder="HH:mm"
                inputMode="numeric"
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={splitInstant === null}
              onClick={() => {
                if (!splitInstant) return
                split(entry.id, splitInstant)
                dialogRef.current?.close()
              }}
            >
              <Scissors className="size-4" /> Split
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button type="button" size="sm" onClick={handleSave} disabled={startInvalid || endInvalid}>
            Save changes
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={() => {
              remove(entry.id)
              dialogRef.current?.close()
            }}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
