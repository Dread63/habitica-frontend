import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/DatePicker'
import { parseDateOnlyString, today, toDateOnlyString } from '@/lib/dateOnly'
import { hhmmToEndMinutes, hhmmToMinutes, minutesFromDate, minutesToHHMM, MINUTES_PER_DAY } from '@/lib/timeOfDay'
import type { Task } from '@/lib/habitica/types'
import {
  entryForTaskOnDate,
  nextGridStart,
  taskSnapshotOf,
  TIMELINE_DEFAULT_DURATION_MINUTES,
  TIMELINE_MIN_DURATION_MINUTES,
} from './timelineEntries'
import { useTimelineEntryStore } from './timelineEntryStore'

interface ScheduleFieldsProps {
  task: Task
  /** "YYYY-MM-DD"; defaults to today. */
  initialDate?: string
  /** Autofocus + select the start-time input on mount — the popover paths
   * (clicking a block, the card clock button) want "type the time, tab,
   * type the end, Enter" with zero extra clicks. Off for the inline
   * editor-form usage, where stealing focus would be rude. */
  autoFocusTime?: boolean
  /** Called after a successful save/remove — closes the wrapping popover. */
  onDone?: () => void
}

/** "Aug 26" — short enough to sit inside a button label. */
function formatDayLabel(date: string): string {
  const parsed = parseDateOnlyString(date)
  return parsed ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date
}

function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

/**
 * The bare start/end/date controls for placing a task on the timeline — no
 * popover or positioning chrome, so they're reusable three ways (same split
 * as DatePicker.tsx's CalendarGrid vs DatePicker): SchedulePopover (card
 * clock-button, context menu, timeline block click), and inline in
 * TaskEditorDialog's form as the fully keyboard-accessible path.
 *
 * **Start and end, not start and a length.** This used to ask for a start
 * time plus a duration in minutes, which described the same placement in a
 * shape nothing else in the feature uses: blocks are drawn between two
 * edges, dragged by an edge, and labeled "9:00 – 9:45". Typing "45" to mean
 * "until 9:45" made the typed path the odd one out. Duration still exists in
 * the model (TimelineEntry.durationMinutes) — it's just derived here, and
 * echoed back as a hint so the length stays visible while you type.
 *
 * Semantics: the form edits **one placement** — the task's entry on the day
 * it opened with — and Save moves that placement, including to another day.
 * It used to resolve the entry against whatever date was currently selected,
 * which meant changing the date found nothing on the new day, fell through to
 * "create", and left the original block sitting where it was: picking
 * tomorrow duplicated the block instead of moving it. Opened on a day with no
 * placement, Save creates one; Remove clears whichever placement is targeted.
 * All buttons are type="button" (this can render inside the editor's form).
 */
export function ScheduleFields({ task, initialDate, autoFocusTime, onDone }: ScheduleFieldsProps) {
  const entries = useTimelineEntryStore((s) => s.entries)
  const store = useTimelineEntryStore()

  // The day this form opened on, fixed for its lifetime. The placement being
  // edited is resolved against *this* date, never the draft's — looking it up
  // by the currently-selected date meant changing the date found nothing,
  // fell through to "create", and left the original block behind as a
  // duplicate instead of moving it. Kept as a live lookup (rather than
  // captured at mount) so it stays correct if the entry is created or removed
  // while the form is open — the editor dialog's inline copy stays mounted
  // for the life of its card.
  const anchorDate = React.useMemo(() => initialDate ?? toDateOnlyString(today()), [initialDate])
  const anchored = entryForTaskOnDate(entries, task.id, anchorDate)

  const [draft, setDraft] = React.useState(() => {
    const existing = entryForTaskOnDate(useTimelineEntryStore.getState().entries, task.id, anchorDate)
    const start = existing?.startMinutes ?? nextGridStart(minutesFromDate(new Date()))
    const duration = existing?.durationMinutes ?? TIMELINE_DEFAULT_DURATION_MINUTES
    return {
      date: anchorDate,
      start: minutesToHHMM(start),
      end: minutesToHHMM(Math.min(start + duration, MINUTES_PER_DAY)),
    }
  })

  // Falling back to a placement already on the *chosen* date keeps the
  // one-per-task-per-date invariant when the form opened without an anchor.
  const target = anchored ?? entryForTaskOnDate(entries, task.id, draft.date)
  const movesDay = anchored !== undefined && draft.date !== anchorDate
  const startMinutes = hhmmToMinutes(draft.start)
  const endMinutes = hhmmToEndMinutes(draft.end)
  const durationMinutes = startMinutes !== null && endMinutes !== null ? endMinutes - startMinutes : null
  const startInvalid = startMinutes === null
  // An end at or before the start is the one genuinely ambiguous input here
  // — blocks can't cross midnight (that's the one-off-per-day model), so
  // "22:00 to 02:00" is a mistake, not a wrap-around to be inferred.
  const endInvalid = endMinutes === null || durationMinutes === null || durationMinutes < TIMELINE_MIN_DURATION_MINUTES

  function handleSave() {
    if (startMinutes === null || durationMinutes === null || endInvalid) return
    if (target) {
      store.rescheduleEntry(target.id, draft.date, startMinutes, durationMinutes)
    } else {
      store.addEntry(task.id, draft.date, startMinutes, durationMinutes, taskSnapshotOf(task))
    }
    onDone?.()
  }

  function handleRemove() {
    if (target) store.removeEntry(target.id)
    onDone?.()
  }

  const saveOnEnter = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">Start (24h)</span>
          <Input
            autoFocus={autoFocusTime}
            value={draft.start}
            onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
            onFocus={(e) => e.target.select()}
            onKeyDown={saveOnEnter}
            placeholder="HH:mm"
            inputMode="numeric"
            aria-label="Start time, 24-hour HH:mm"
            aria-invalid={startInvalid}
            className={startInvalid ? 'border-destructive' : undefined}
          />
        </label>
        <span className="pb-2 text-xs text-muted-foreground">to</span>
        <label className="flex flex-1 flex-col gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">End</span>
          <Input
            value={draft.end}
            onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
            onFocus={(e) => e.target.select()}
            onKeyDown={saveOnEnter}
            placeholder="HH:mm"
            inputMode="numeric"
            aria-label="End time, 24-hour HH:mm"
            aria-invalid={endInvalid}
            className={endInvalid ? 'border-destructive' : undefined}
          />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {endInvalid || durationMinutes === null
          ? `End must be at least ${TIMELINE_MIN_DURATION_MINUTES} minutes after the start (same day).`
          : formatSpan(durationMinutes)}
      </p>
      <DatePicker
        value={draft.date}
        onChange={(date) => {
          // An empty value means "Clear" was clicked in the calendar — for a
          // timeline placement that's meaningless (Remove handles removal),
          // so ignore it rather than land in a dateless draft state.
          if (date) setDraft((d) => ({ ...d, date }))
        }}
        placeholder="Pick a day"
      />
      <div className="flex items-center gap-2">
        {/* The label states which of the three things Save will do, so a
            day change reads as a move rather than looking like an add. */}
        <Button type="button" size="sm" onClick={handleSave} disabled={startInvalid || endInvalid}>
          {movesDay ? `Move to ${formatDayLabel(draft.date)}` : target ? 'Update' : 'Add to timeline'}
        </Button>
        {target && (
          <Button type="button" size="sm" variant="ghost" onClick={handleRemove} className="text-destructive">
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}
