import * as React from 'react'
import { CalendarClock, ClockPlus, Trash2 } from 'lucide-react'
import type { Task } from '@/lib/habitica/types'
import { today, toDateOnlyString } from '@/lib/dateOnly'
import { minutesFromDate } from '@/lib/timeOfDay'
import {
  entryForTaskOnDate,
  nextGridStart,
  taskSnapshotOf,
  TIMELINE_DEFAULT_DURATION_MINUTES,
} from './timelineEntries'
import { useTimelineEntryStore } from './timelineEntryStore'

const MENU_WIDTH = 224 // w-56
const MENU_HEIGHT = 96

interface TaskContextMenuProps {
  x: number
  y: number
  task: Task
  onClose: () => void
  /** "Schedule…"/"Reschedule…" — the parent opens SchedulePopover at the same anchor. */
  onOpenSchedule: () => void
}

/**
 * The app's first right-click menu — same hand-rolled fixed-position chrome
 * as SchedulePopover/LaterDatePopover (viewport-clamped at the contextmenu
 * event's coordinates, outside-pointerdown/Escape to close). It's a
 * shortcut layer only: everything here is also reachable via the card's
 * clock button and the editor's Timeline field, so no functionality is
 * mouse-gesture-locked.
 */
export function TaskContextMenu({ x, y, task, onClose, onOpenSchedule }: TaskContextMenuProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const entries = useTimelineEntryStore((s) => s.entries)
  const store = useTimelineEntryStore()
  const todayStr = toDateOnlyString(today())
  const todayEntry = entryForTaskOnDate(entries, task.id, todayStr)

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const left = Math.min(Math.max(x, 8), window.innerWidth - MENU_WIDTH - 8)
  const top = Math.min(y, window.innerHeight - MENU_HEIGHT - 8)

  const itemClass =
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted'

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-30 w-56 rounded-lg border border-border bg-card p-1 text-card-foreground shadow-lg"
      style={{ left, top }}
    >
      {todayEntry ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              onClose()
              onOpenSchedule()
            }}
          >
            <CalendarClock className="size-4 text-muted-foreground" /> Reschedule…
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-destructive`}
            onClick={() => {
              store.removeEntry(todayEntry.id)
              onClose()
            }}
          >
            <Trash2 className="size-4" /> Remove from timeline
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              store.addEntry(
                task.id,
                todayStr,
                nextGridStart(minutesFromDate(new Date())),
                TIMELINE_DEFAULT_DURATION_MINUTES,
                taskSnapshotOf(task),
              )
              onClose()
            }}
          >
            <ClockPlus className="size-4 text-muted-foreground" /> Send to timeline (now)
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              onClose()
              onOpenSchedule()
            }}
          >
            <CalendarClock className="size-4 text-muted-foreground" /> Schedule…
          </button>
        </>
      )}
    </div>
  )
}
