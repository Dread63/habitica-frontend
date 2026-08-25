import * as React from 'react'
import { Clock, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import type { Task } from '@/lib/habitica/types'
import { isSameDate, parseDateOnlyString, today } from '@/lib/dateOnly'
import { formatMinutesOfDay, minutesFromDate, MINUTES_PER_DAY } from '@/lib/timeOfDay'
import { TASK_TYPE_META } from '@/features/tasks/taskType'
import { usePomodoroStore } from '@/features/pomodoro/pomodoroStore'
import {
  clampStartMinutes,
  snapToGrid,
  taskSnapshotOf,
  TIMELINE_DEFAULT_DURATION_MINUTES,
  TIMELINE_MIN_DURATION_MINUTES,
  type TimelineEntry,
} from './timelineEntries'
import { assignLanes, type LanedEntry } from './timelineLanes'
import { useTimelineEntryStore } from './timelineEntryStore'

/** Zoom range, px per hour. Scroll-wheel over the timeline zooms (anchored
 * at the cursor); blocks scale with it. Default is roomy enough that a
 * 30-minute block shows a readable title. */
const MIN_HOUR_PX = 48
const MAX_HOUR_PX = 320
const DEFAULT_HOUR_PX = 160
const AXIS_H = 28
const LANE_H = 64
const LANE_GAP = 8
const MIN_VISIBLE_LANES = 3

interface TimelineScrubberProps {
  date: string
  entries: TimelineEntry[]
  tasksById: ReadonlyMap<string, Task>
  onOpenSchedule: (task: Task, anchor: { x: number; y: number }) => void
  /** Clicking a block's body opens the full task detail view — the same
   * dialog the Dashboard's cards open. */
  onOpenDetail: (task: Task) => void
}

/** One in-flight edge-resize: the previewed geometry, applied to the store
 * only on pointer-up. */
interface ResizePreview {
  entryId: string
  edge: 'start' | 'end'
  startMinutes: number
  durationMinutes: number
}

function useNowMinutes(): number {
  const [minutes, setMinutes] = React.useState(() => minutesFromDate(new Date()))
  React.useEffect(() => {
    const update = () => setMinutes(minutesFromDate(new Date()))
    const id = window.setInterval(update, 30_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return minutes
}

/**
 * The horizontal day timeline. Interactions, all layered without fighting:
 * - scroll-wheel over it zooms (cursor-anchored, native non-passive
 *   listener since React's synthetic wheel can't preventDefault);
 * - click-drag on empty space pans left/right (pointer events, skipped
 *   when the press lands on a block);
 * - blocks move via HTML5 drag (payload `entry:<id>`), rail drops arrive
 *   as `task:<id>`;
 * - block edges resize via pointer-capture drag with a live snapped time
 *   bubble (:15 steps, Apple-Calendar-style), committed on release;
 * - clicking a block opens the task's full detail view (the same dialog the
 *   Dashboard opens), and its hover clock button opens ScheduleFields — the
 *   accessible path for the drag interactions above.
 */
export function TimelineScrubber({
  date,
  entries,
  tasksById,
  onOpenSchedule,
  onOpenDetail,
}: TimelineScrubberProps) {
  const store = useTimelineEntryStore()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [hourPx, setHourPx] = React.useState(DEFAULT_HOUR_PX)
  const [isDragOver, setIsDragOver] = React.useState(false)
  const [draggingEntryId, setDraggingEntryId] = React.useState<string | null>(null)
  const [resizePreview, setResizePreview] = React.useState<ResizePreview | null>(null)
  const panRef = React.useRef<{ startX: number; startScroll: number } | null>(null)
  const nowMinutes = useNowMinutes()
  const pxPerMinute = hourPx / 60

  const viewedDay = parseDateOnlyString(date)
  const isToday = viewedDay !== null && isSameDate(viewedDay, today())

  const { laned, laneCount } = React.useMemo(() => assignLanes(entries), [entries])
  const bodyH = Math.max(laneCount, MIN_VISIBLE_LANES) * LANE_H + LANE_GAP

  // Initial scroll: land the interesting part of the day in view.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const perMin = hourPx / 60
    const target = isToday ? (nowMinutes - 90) * perMin : 7 * hourPx
    el.scrollLeft = Math.max(0, target)
    // Re-run when the viewed date changes only — not on zoom or "now" ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  // Cursor-anchored wheel zoom. Native listener: React's wheel events are
  // passive at the root, so preventDefault (needed to stop page scroll
  // while zooming) only works on a manually-attached non-passive handler.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      setHourPx((prev) => {
        const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
        const next = Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, prev * factor))
        if (next !== prev && el) {
          const cursorX = event.clientX - el.getBoundingClientRect().left
          const contentX = el.scrollLeft + cursorX
          // Apply after React re-renders the wider/narrower content, so the
          // point under the cursor stays put.
          requestAnimationFrame(() => {
            el.scrollLeft = contentX * (next / prev) - cursorX
          })
        }
        return next
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragOver(false)
    const payload = event.dataTransfer.getData('text/plain')
    const rect = event.currentTarget.getBoundingClientRect()
    const minutes = clampStartMinutes(snapToGrid((event.clientX - rect.left) / pxPerMinute))
    if (payload.startsWith('task:')) {
      const taskId = payload.slice(5)
      const task = tasksById.get(taskId)
      store.addEntry(
        taskId,
        date,
        minutes,
        TIMELINE_DEFAULT_DURATION_MINUTES,
        task ? taskSnapshotOf(task) : undefined,
      )
    } else if (payload.startsWith('entry:')) {
      store.moveEntry(payload.slice(6), minutes)
    }
  }

  function commitResize(preview: ResizePreview) {
    if (preview.edge === 'start') store.moveEntry(preview.entryId, preview.startMinutes)
    store.resizeEntry(preview.entryId, preview.durationMinutes)
    setResizePreview(null)
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'cursor-grab overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-card transition-shadow',
        panRef.current && 'cursor-grabbing',
        isDragOver && 'ring-2 ring-primary/40',
      )}
      onPointerDown={(event) => {
        // Pan only from empty timeline space with the main button — presses
        // on blocks/handles have their own drag/resize behaviors.
        if (event.button !== 0) return
        if ((event.target as HTMLElement).closest('[data-block]')) return
        panRef.current = { startX: event.clientX, startScroll: scrollRef.current?.scrollLeft ?? 0 }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!panRef.current || !scrollRef.current) return
        scrollRef.current.scrollLeft = panRef.current.startScroll - (event.clientX - panRef.current.startX)
      }}
      onPointerUp={() => {
        panRef.current = null
      }}
      onPointerCancel={() => {
        panRef.current = null
      }}
    >
      <div
        className="relative"
        style={{ width: 24 * hourPx, height: AXIS_H + bodyH }}
        onDragOver={(event) => {
          event.preventDefault() // required for onDrop to fire at all
          event.dataTransfer.dropEffect = 'move'
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="absolute top-0 bottom-0 border-l border-border/50" style={{ left: h * hourPx }}>
            <span className="px-1.5 text-[11px] leading-7 whitespace-nowrap text-muted-foreground select-none">
              {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'AM' : 'PM'}
            </span>
          </div>
        ))}

        {isToday && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary"
            style={{ left: nowMinutes * pxPerMinute }}
          >
            <div className="absolute -top-0 -left-[3px] size-[7px] rounded-full bg-primary" />
          </div>
        )}

        {entries.length === 0 && (
          <p className="absolute inset-x-0 top-1/2 text-center text-sm text-muted-foreground select-none">
            Drag tasks here — or right-click any task card and send it to the timeline.
          </p>
        )}

        {laned.map((l) => (
          <TimelineBlock
            key={l.entry.id}
            laned={l}
            task={tasksById.get(l.entry.taskId)}
            pxPerMinute={pxPerMinute}
            isDragging={draggingEntryId === l.entry.id}
            resizePreview={resizePreview?.entryId === l.entry.id ? resizePreview : null}
            onDragStateChange={(dragging) => setDraggingEntryId(dragging ? l.entry.id : null)}
            onResizePreview={setResizePreview}
            onResizeCommit={commitResize}
            onOpenSchedule={onOpenSchedule}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}

function TimelineBlock({
  laned,
  task,
  pxPerMinute,
  isDragging,
  resizePreview,
  onDragStateChange,
  onResizePreview,
  onResizeCommit,
  onOpenSchedule,
  onOpenDetail,
}: {
  laned: LanedEntry
  task: Task | undefined
  pxPerMinute: number
  isDragging: boolean
  resizePreview: ResizePreview | null
  onDragStateChange: (dragging: boolean) => void
  onResizePreview: (preview: ResizePreview | null) => void
  onResizeCommit: (preview: ResizePreview) => void
  onOpenSchedule: (task: Task, anchor: { x: number; y: number }) => void
  onOpenDetail: (task: Task) => void
}) {
  const { entry, lane } = laned
  const startPomodoro = usePomodoroStore((s) => s.startSession)
  const pomodoroStatus = usePomodoroStore((s) => s.run.status)
  const resizeOriginRef = React.useRef<{ x: number; startMinutes: number; durationMinutes: number } | null>(null)

  // Live task first, the entry's own snapshot second. That fallback is the
  // fix for a real bug: ticking off a scheduled to-do makes Habitica drop it
  // from GET /tasks/user entirely, which used to turn its block into
  // "Deleted task" — see TimelineEntry.taskSnapshot.
  const snapshot = entry.taskSnapshot
  const text = task?.text ?? snapshot?.text ?? 'Unknown task'
  const type = task?.type ?? snapshot?.type
  const titleRef = useTwemoji<HTMLParagraphElement>([text])
  const accent = type ? TASK_TYPE_META[type].accent : 'var(--muted-foreground)'
  const completed = task !== undefined && 'completed' in task && task.completed

  // While an edge is being dragged, render the previewed geometry.
  const start = resizePreview?.startMinutes ?? entry.startMinutes
  const duration = resizePreview?.durationMinutes ?? entry.durationMinutes
  const endMinutes = Math.min(start + duration, MINUTES_PER_DAY)
  const timeLabel = `${formatMinutesOfDay(start)} – ${formatMinutesOfDay(endMinutes)}`

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    // preventDefault stops the parent's HTML5 drag from initiating;
    // stopPropagation keeps the scrubber's pan from grabbing it.
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeOriginRef.current = { x: event.clientX, startMinutes: entry.startMinutes, durationMinutes: entry.durationMinutes }
  }

  function updateResize(edge: 'start' | 'end') {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = resizeOriginRef.current
      if (!origin) return
      const deltaMinutes = (event.clientX - origin.x) / pxPerMinute
      const originEnd = origin.startMinutes + origin.durationMinutes
      if (edge === 'start') {
        const newStart = Math.min(
          Math.max(snapToGrid(origin.startMinutes + deltaMinutes), 0),
          originEnd - TIMELINE_MIN_DURATION_MINUTES,
        )
        onResizePreview({ entryId: entry.id, edge, startMinutes: newStart, durationMinutes: originEnd - newStart })
      } else {
        const newEnd = Math.min(
          Math.max(snapToGrid(originEnd + deltaMinutes), origin.startMinutes + TIMELINE_MIN_DURATION_MINUTES),
          MINUTES_PER_DAY,
        )
        onResizePreview({
          entryId: entry.id,
          edge,
          startMinutes: origin.startMinutes,
          durationMinutes: newEnd - origin.startMinutes,
        })
      }
    }
  }

  function endResize() {
    if (!resizeOriginRef.current) return
    resizeOriginRef.current = null
    if (resizePreview) onResizeCommit(resizePreview)
    else onResizePreview(null)
  }

  const isResizing = resizePreview !== null
  const handleClass =
    'absolute top-0 bottom-0 z-10 w-2.5 cursor-ew-resize rounded-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/10'

  return (
    <div
      data-block
      draggable={!isResizing}
      onDragStart={(event) => {
        onDragStateChange(true)
        event.dataTransfer.setData('text/plain', `entry:${entry.id}`)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => onDragStateChange(false)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        if (task) onOpenDetail(task)
      }}
      title={`${text} · ${timeLabel}`}
      className={cn(
        'group absolute flex cursor-grab flex-col justify-center overflow-visible rounded-md border-l-4 px-2.5 py-1',
        'bg-muted/70 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing',
        isDragging && 'opacity-40',
        completed && 'opacity-60',
      )}
      style={{
        left: start * pxPerMinute,
        width: Math.max(duration * pxPerMinute, 28),
        top: AXIS_H + lane * LANE_H,
        height: LANE_H - LANE_GAP,
        borderLeftColor: accent,
      }}
    >
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        <p ref={titleRef} className={cn('min-w-0 flex-1 truncate text-sm font-medium', completed && 'line-through')}>
          {emojify(text)}
        </p>
        {task && (
          <button
            type="button"
            aria-label={`Change the scheduled time for ${text}`}
            title="Change start/end time"
            onClick={(event) => onOpenSchedule(task, { x: event.clientX, y: event.clientY })}
            className="hidden shrink-0 rounded p-1 text-muted-foreground transition-colors group-hover:block hover:bg-background hover:text-foreground"
          >
            <Clock className="size-4" />
          </button>
        )}
        {task && pomodoroStatus === 'idle' && (
          <button
            type="button"
            aria-label={`Start focus session on ${text}`}
            title="Start focus session"
            // Pinned: picking a specific block's timer is an explicit choice,
            // so it shouldn't be re-derived from the timeline next phase.
            onClick={() => startPomodoro([{ id: task.id, text: task.text, tagIds: task.tags }], true)}
            className="hidden shrink-0 rounded p-1 text-muted-foreground transition-colors group-hover:block hover:bg-background hover:text-primary"
          >
            <Timer className="size-4" />
          </button>
        )}
      </div>
      <p className="truncate text-[11px] text-muted-foreground">{timeLabel}</p>

      {/* Edge resize handles + the live snapped-time bubble while dragging. */}
      <div
        role="presentation"
        aria-hidden="true"
        className={cn(handleClass, '-left-0.5')}
        onPointerDown={beginResize}
        onPointerMove={updateResize('start')}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
      <div
        role="presentation"
        aria-hidden="true"
        className={cn(handleClass, '-right-0.5')}
        onPointerDown={beginResize}
        onPointerMove={updateResize('end')}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
      {resizePreview && (
        <span
          className={cn(
            'pointer-events-none absolute -top-6 z-20 rounded border border-border bg-card px-1.5 py-0.5',
            'text-[11px] font-medium whitespace-nowrap shadow-md',
            resizePreview.edge === 'start' ? 'left-0' : 'right-0',
          )}
        >
          {resizePreview.edge === 'start'
            ? formatMinutesOfDay(resizePreview.startMinutes)
            : formatMinutesOfDay(resizePreview.startMinutes + resizePreview.durationMinutes)}
        </span>
      )}
    </div>
  )
}
