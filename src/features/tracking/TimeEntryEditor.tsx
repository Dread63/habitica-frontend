import * as React from 'react'
import { Scissors, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, type DialogHandle } from '@/components/ui/dialog'
import { combineDateAndTime, hhmmToMinutes, minutesToHHMM } from '@/lib/timeOfDay'
import { useTasks } from '@/features/tasks/useTasks'
import { isSchedulableTaskType } from '@/features/tasks/taskType'
import { SubjectPicker } from '@/features/activities/SubjectPicker'
import { type TimeSubject } from '@/features/activities/subject'
import {
  entryDurationMs,
  isOpen,
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

/** "45m" for a span still being typed, so the length is visible before saving. */
function spanLabel(start: Date | null, end: Date | null): string {
  if (!start || !end) return ''
  return `That's ${formatDuration(Math.max(0, end.getTime() - start.getTime()))}.`
}

/**
 * What the dialog is doing. `edit` corrects an interval that exists; `insert`
 * records one that never did — the gap you clicked on the timeline's Actual
 * ribbon, carved into whatever surrounds it. They share every control, which
 * is the point: correcting the day and filling in the day are the same gesture.
 */
export type TimeEntryEditorMode = 'edit' | 'insert'

/** The span an `insert` starts from — a gap on the ribbon, or a whole day. */
export interface TimeEntryDraft {
  startedAt: string
  endedAt: string
}

/**
 * Correcting a recorded interval, or filling in one that was never recorded —
 * you will forget to switch tasks, and a log you can't fix is a log you stop
 * trusting.
 *
 * An **edit** routes through `editEntry`, which captures the original values on
 * the **first** edit and never overwrites them. So the record keeps saying what
 * was captured live alongside what you corrected it to, and the CSV exports
 * both. That distinction is what lets the log stand as evidence rather than
 * just as data.
 *
 * An **insert** routes through `insertEntry`, which carves the span out of
 * whatever already occupies it. It edits records the user did not select, so
 * the dialog says so in plain language before they commit — see the note above
 * the buttons.
 */
export function TimeEntryEditor({
  entry,
  draft,
  onClose,
}: {
  /** The interval being corrected. Absent in `insert` mode. */
  entry?: TimeEntry
  /** The span being filled. Present in `insert` mode. */
  draft?: TimeEntryDraft
  onClose: () => void
}) {
  const dialogRef = React.useRef<DialogHandle>(null)
  const { edit, split, remove, insert } = useTimeEntryStore()
  const tasksQuery = useTasks()

  const mode: TimeEntryEditorMode = entry ? 'edit' : 'insert'
  // One anchor for both modes, so every derived instant below is written once.
  const anchor = entry ?? {
    startedAt: draft?.startedAt ?? new Date().toISOString(),
    endedAt: draft?.endedAt ?? new Date().toISOString(),
  }

  const [subject, setSubject] = React.useState<TimeSubject | null>(() =>
    entry
      ? { id: entry.taskId, text: entry.taskSnapshot.text, type: entry.taskSnapshot.type, tagIds: entry.taskSnapshot.tagIds }
      : null,
  )
  const [start, setStart] = React.useState(() => hhmmOf(anchor.startedAt))
  const [end, setEnd] = React.useState(() => (anchor.endedAt ? hhmmOf(anchor.endedAt) : ''))
  const [splitAt, setSplitAt] = React.useState('')

  React.useEffect(() => {
    dialogRef.current?.open()
  }, [])

  const day = new Date(anchor.startedAt)
  const startInstant = combineDateAndTime(day, start)
  const endInstant = end ? combineDateAndTime(day, end) : null
  const startInvalid = startInstant === null
  // An open entry may legitimately have no end; a closed one — and every
  // insert — must keep a sane, forward-running interval.
  const openEntry = entry !== undefined && isOpen(entry)
  const endInvalid =
    !openEntry && (endInstant === null || endInstant.getTime() - (startInstant?.getTime() ?? 0) < MIN_ENTRY_MS)

  const tasks = (tasksQuery.data ?? []).filter((t) => isSchedulableTaskType(t.type))
  const splitMinutes = hhmmToMinutes(splitAt)
  const splitInstant = splitMinutes === null ? null : combineDateAndTime(day, splitAt)
  const canSave = !startInvalid && !endInvalid && subject !== null

  function handleSave() {
    if (!canSave || subject === null) return
    if (entry === undefined) {
      insert(subject, startInstant!.toISOString(), endInstant!.toISOString())
    } else {
      edit(entry.id, {
        taskId: subject.id,
        taskSnapshot: { text: subject.text, type: subject.type, tagIds: subject.tagIds },
        startedAt: startInstant!.toISOString(),
        ...(openEntry && !endInstant ? {} : { endedAt: endInstant!.toISOString() }),
      })
    }
    dialogRef.current?.close()
  }

  return (
    <Dialog
      ref={dialogRef}
      title={mode === 'insert' ? 'Log time here' : 'Edit interval'}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {mode === 'insert' ? 'What were you doing?' : 'Task or activity'}
          </span>
          <SubjectPicker
            value={subject}
            onChange={setSubject}
            tasks={tasks}
            autoFocus={mode === 'insert'}
            placeholder="Search tasks, or name an activity…"
          />
        </div>

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
              placeholder={openEntry ? 'still running' : 'HH:mm'}
              inputMode="numeric"
              aria-invalid={endInvalid}
              className={endInvalid ? 'border-destructive' : undefined}
            />
          </label>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {startInvalid || endInvalid
            ? 'Times must be HH:mm, and the end at least a few seconds after the start.'
            : entry
              ? `Currently ${formatDuration(entryDurationMs(entry, new Date()))}.`
              : spanLabel(startInstant, endInstant)}
          {entry?.audit && (
            <>
              {' '}
              Originally {hhmmOf(entry.audit.original.startedAt)}
              {entry.audit.original.endedAt ? `–${hhmmOf(entry.audit.original.endedAt)}` : ''}; edited{' '}
              {entry.audit.editCount} {entry.audit.editCount === 1 ? 'time' : 'times'}.
            </>
          )}
        </p>

        {mode === 'insert' && (
          // Said plainly up front, because this action edits records the user
          // did not select. Anything it fully covers is removed; anything it
          // overlaps is trimmed or split, and every other minute is left alone.
          <p className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
            Anything already recorded over this span will be trimmed to make room, and split in two if this
            lands inside it. Nothing outside the span changes.
          </p>
        )}

        {entry && !openEntry && (
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
                split(entry!.id, splitInstant)
                dialogRef.current?.close()
              }}
            >
              <Scissors className="size-4" /> Split
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
            {mode === 'insert' ? 'Log it' : 'Save changes'}
          </Button>
          {subject === null && (
            <span className="text-[11px] text-muted-foreground">Pick a task or name an activity first.</span>
          )}
          {entry && (
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
          )}
        </div>
      </div>
    </Dialog>
  )
}
