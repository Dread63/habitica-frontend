import * as React from 'react'
import { Clock, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDragGuard } from '@/lib/dnd/useDragGuard'
import { isActivityId, subjectOfTask, type TimeSubject } from '@/features/activities/subject'
import { recentActivities } from '@/features/activities/recentActivities'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import type { Task } from '@/lib/habitica/types'
import { isSameDate, parseDateOnlyString, today } from '@/lib/dateOnly'
import { formatMinutesOfDay, MINUTES_PER_DAY } from '@/lib/timeOfDay'
import { useNowMinutes } from '@/lib/useNowTick'
import { TASK_TYPE_META } from '@/features/tasks/taskType'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { usePomodoroStore } from '@/features/pomodoro/pomodoroStore'
import { categoryFill } from '@/features/pomodoro/pomodoroCategories'
import {
  entriesOverlappingDay,
  openEntryOf,
  timeEntryToDayBand,
} from '@/features/tracking/timeEntries'
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
/** The "actual" ribbon under the planned lanes. One lane is enough by
 * construction: recorded intervals never overlap, and a single unbroken band
 * is itself the visual proof that every minute has exactly one owner. */
const RIBBON_H = 26
const RIBBON_GAP = 10
/** Width a too-narrow block grows to while hovered or focused: enough for a
 * readable title, the time range beneath it, and both action buttons. A block
 * already this wide never moves. */
const EXPANDED_PX = 180
/** Narrowest a block is ever drawn at rest. The band stays honest about the
 * span it occupies — hover is what makes a short one usable — and this is still
 * wide enough for the two 10px edge handles to have something to sit on. */
const MIN_BLOCK_PX = 28
/** Shorter untracked stretches aren't offered as "log something here" — below
 * this they are rounding, not a hole in the day. */
const MIN_GAP_MINUTES = 5

/** What a block's clock button is asking to reschedule. `entryId` addresses
 * the exact placement, which matters for an activity — it may have several on
 * one day, so (subject, date) no longer identifies one. */
export interface ScheduleTarget {
  subject: TimeSubject
  entryId: string
}

interface TimelineScrubberProps {
  date: string
  entries: TimelineEntry[]
  tasksById: ReadonlyMap<string, Task>
  onOpenSchedule: (target: ScheduleTarget, anchor: { x: number; y: number }) => void
  /** Clicking a block's body opens the full task detail view — the same
   * dialog the Dashboard's cards open. */
  onOpenDetail: (task: Task) => void
  /** A recorded interval on the Actual ribbon was clicked — open it for
   * correction. */
  onEditEntry: (entryId: string) => void
  /** An untracked stretch was clicked — open the editor prefilled with it. */
  onLogGap: (startMinutes: number, endMinutes: number) => void
}

/** One in-flight edge-resize: the previewed geometry, applied to the store
 * only on pointer-up. */
interface ResizePreview {
  entryId: string
  edge: 'start' | 'end'
  startMinutes: number
  durationMinutes: number
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
  onEditEntry,
  onLogGap,
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
  const ribbonTop = AXIS_H + bodyH + RIBBON_GAP

  // The recorded half of the day. Deliberately read straight from the ledger
  // rather than derived from the blocks above — that separation is the whole
  // point, and the gaps between bands are honest untracked time.
  const trackedTagIds = usePomodoroStore((s) => s.settings.trackedTagIds)
  const timeEntries = useTimeEntryStore((s) => s.entries)
  // All dates, not just this day's `entries` prop — an activity dragged in
  // today may only ever have been used last week.
  const planEntries = useTimelineEntryStore((s) => s.entries)
  const ribbon = React.useMemo(() => {
    const now = new Date()
    return entriesOverlappingDay(timeEntries, date, now)
      .map((entry) => {
        const band = timeEntryToDayBand(entry, date, now)
        if (!band) return null
        const primaryTag = entry.taskSnapshot.tagIds.find((t) => trackedTagIds.includes(t)) ?? null
        return { entry, band, primaryTag }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
    // nowMinutes keeps an open interval growing as the clock moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeEntries, date, trackedTagIds, nowMinutes])

  // The untracked stretches between bands. Clickable, because "there is a
  // hole in my log here" is the moment you want to fill it — this is the entry
  // point for backfilling an interruption. Derived from the same bands that
  // are drawn, so what you click is exactly what you see.
  const gaps = React.useMemo(() => {
    const out: { startMinutes: number; endMinutes: number }[] = []
    let cursor = 0
    for (const { band } of [...ribbon].sort((a, b) => a.band.startMinutes - b.band.startMinutes)) {
      if (band.startMinutes - cursor >= MIN_GAP_MINUTES) {
        out.push({ startMinutes: cursor, endMinutes: band.startMinutes })
      }
      cursor = Math.max(cursor, band.endMinutes)
    }
    // The tail of the day is only offered up to "now" on today — inviting a
    // click on 9pm at lunchtime would be inviting a log of the future.
    const dayEnd = isToday ? nowMinutes : MINUTES_PER_DAY
    if (dayEnd - cursor >= MIN_GAP_MINUTES) out.push({ startMinutes: cursor, endMinutes: dayEnd })
    return out
  }, [ribbon, isToday, nowMinutes])

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
    if (payload.startsWith('subject:')) {
      // A *subject* id: a Habitica task, or an ad-hoc activity. The rail emits
      // both, and the only difference here is where the snapshot comes from —
      // an activity has no live task to read, so its label and tags come from
      // the history the rail listed it out of.
      const subjectId = payload.slice(8)
      const task = tasksById.get(subjectId)
      const activity = isActivityId(subjectId)
        ? recentActivities(timeEntries, planEntries).find((a) => a.id === subjectId)
        : undefined
      const snapshot = task
        ? taskSnapshotOf(task)
        : activity
          ? { text: activity.text, tagIds: activity.tagIds }
          : undefined
      store.addEntry(subjectId, date, minutes, TIMELINE_DEFAULT_DURATION_MINUTES, snapshot)
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
        style={{ width: 24 * hourPx, height: ribbonTop + RIBBON_H }}
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

        {/* Divider between what you planned and what you did. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 border-t border-dashed border-border"
          style={{ top: ribbonTop - RIBBON_GAP / 2, width: 24 * hourPx }}
        />
        {/* A gap is a hole in the record, and clicking one opens the editor
            prefilled with its span — the "sit back down and log the
            interruption" path. Rendered under the bands so a band always wins
            an overlapping click. */}
        {gaps.map((gap) => (
          <button
            key={`gap-${gap.startMinutes}`}
            type="button"
            title={`Log time for ${formatMinutesOfDay(gap.startMinutes)} – ${formatMinutesOfDay(gap.endMinutes)}`}
            aria-label={`Log time between ${formatMinutesOfDay(gap.startMinutes)} and ${formatMinutesOfDay(gap.endMinutes)}`}
            onClick={() => onLogGap(gap.startMinutes, gap.endMinutes)}
            className="group/gap absolute rounded-sm border border-dashed border-transparent transition-colors hover:border-primary/50 hover:bg-primary/10"
            style={{
              left: gap.startMinutes * pxPerMinute,
              width: (gap.endMinutes - gap.startMinutes) * pxPerMinute,
              top: ribbonTop,
              height: RIBBON_H,
            }}
          >
            <span className="px-1.5 text-[10px] leading-[26px] whitespace-nowrap text-primary opacity-0 transition-opacity group-hover/gap:opacity-100">
              + Log
            </span>
          </button>
        ))}
        {ribbon.map(({ entry, band, primaryTag }) => (
          <button
            key={entry.id}
            type="button"
            title={`${entry.taskSnapshot.text} · ${formatMinutesOfDay(band.startMinutes)} – ${formatMinutesOfDay(band.endMinutes)} · click to correct`}
            aria-label={`Correct the recorded interval for ${entry.taskSnapshot.text}`}
            onClick={() => onEditEntry(entry.id)}
            className={cn(
              'absolute overflow-hidden rounded-sm text-left transition-shadow hover:shadow-md',
              'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
              entry.endedAt === null && 'animate-pulse',
            )}
            style={{
              left: band.startMinutes * pxPerMinute,
              width: Math.max((band.endMinutes - band.startMinutes) * pxPerMinute, 2),
              top: ribbonTop,
              height: RIBBON_H,
              backgroundColor: categoryFill(primaryTag, trackedTagIds),
              opacity: primaryTag === null ? 0.45 : 0.85,
            }}
          >
            <span className="px-1.5 text-[10px] leading-[26px] whitespace-nowrap text-white mix-blend-luminosity">
              {entry.taskSnapshot.text}
            </span>
          </button>
        ))}

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

/**
 * A block's title, time range and actions — rendered either inline in a wide
 * block or inside the flyout of a narrow one.
 *
 * One component for both placements on purpose. The two used to be one inline
 * fragment that simply became unreadable below ~130px; duplicating it for the
 * narrow case would have left two copies of the tracking-button wiring to keep
 * in step, which is exactly the kind of thing that silently rots.
 */
function BlockContents({
  text,
  timeLabel,
  titleRef,
  completed,
  isTracked,
  actions,
  onOpenSchedule,
  onStartTracking,
}: {
  text: string
  timeLabel: string
  titleRef: React.Ref<HTMLParagraphElement>
  completed: boolean
  isTracked: boolean
  /**
   * - `hover` — reserve their space and fade them in. Stable layout, for a
   *   block wide enough to hold them.
   * - `always` — the block has grown on hover; they are the reason it grew.
   * - `none` — **not rendered at all.** A narrow block at rest cannot spare
   *   48px of reserved button space; doing so is what left it looking blank.
   */
  actions: 'hover' | 'always' | 'none'
  onOpenSchedule: (anchor: { x: number; y: number }) => void
  onStartTracking: () => void
}) {
  // opacity rather than `hidden`/`block` in `hover` mode: these are flex
  // children, so toggling display re-truncates the title on every hover.
  // Reserving the space keeps the layout still — which is only affordable when
  // there is space to reserve, hence `none`.
  const actionClass = cn(
    'shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-background',
    actions === 'always'
      ? 'opacity-100'
      : 'opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
  )

  const showActions = actions !== 'none'

  return (
    <>
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        <p ref={titleRef} className={cn('min-w-0 flex-1 truncate text-sm font-medium', completed && 'line-through')}>
          {emojify(text)}
        </p>
        {/* Both actions used to be gated on the live task resolving. They are
            now gated on nothing: an ad-hoc activity block has no Task behind it
            and is exactly as schedulable and as trackable as one that does. */}
        {showActions && (
          <button
            type="button"
            aria-label={`Change the scheduled time for ${text}`}
            title="Change start/end time"
            onClick={(event) => onOpenSchedule({ x: event.clientX, y: event.clientY })}
            className={cn(actionClass, 'hover:text-foreground')}
          >
            <Clock className="size-4" />
          </button>
        )}
        {showActions && !isTracked && (
          <button
            type="button"
            aria-label={`Start tracking ${text}`}
            title="Start tracking this"
            // No longer gated on the timer being idle: switching what you're
            // working on is one click, with or without a pomodoro running.
            onClick={onStartTracking}
            className={cn(actionClass, 'hover:text-primary')}
          >
            <Timer className="size-4" />
          </button>
        )}
      </div>
      <p className="truncate text-[11px] text-muted-foreground">{timeLabel}</p>
    </>
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
  onOpenSchedule: (target: ScheduleTarget, anchor: { x: number; y: number }) => void
  onOpenDetail: (task: Task) => void
}) {
  const { entry, lane } = laned
  const startTracking = useTimeEntryStore((s) => s.start)
  const isTracked = useTimeEntryStore((s) => openEntryOf(s.entries)?.taskId === entry.taskId)
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
  // Live task first, snapshot second — the same fallback the title uses, so an
  // activity block (which never resolves) still has a full subject to track
  // and reschedule with.
  const subject: TimeSubject = task
    ? subjectOfTask(task)
    : { id: entry.taskId, text, type, tagIds: snapshot?.tagIds ?? [] }

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

  // A short block keeps its title — clipped to whatever fits, which is how this
  // always worked — and *grows in place* on hover or keyboard focus until the
  // title, the time range and both buttons fit. It grows rightward, so the left
  // edge (the start time, the meaningful anchor) never moves; the exception is
  // a block within EXPANDED_PX of midnight, which is nudged left instead of
  // being allowed to overflow the canvas and jog the horizontal scrollbar.
  //
  // Suppressed mid-drag and mid-resize: the width is already being previewed
  // there, and a second thing changing it at the same time reads as a glitch.
  // Hover and focus are tracked separately rather than as one "active" flag:
  // moving the mouse off a block you are tabbed into must not collapse it out
  // from under the focused button.
  const [hovered, setHovered] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const restWidth = Math.max(duration * pxPerMinute, MIN_BLOCK_PX)
  const left = start * pxPerMinute
  const isNarrow = restWidth < EXPANDED_PX
  const isExpanded = (hovered || focused) && isNarrow && !isDragging && !isResizing
  const width = isExpanded ? EXPANDED_PX : restWidth
  const renderedLeft = isExpanded
    ? Math.min(left, Math.max(0, MINUTES_PER_DAY * pxPerMinute - EXPANDED_PX))
    : left

  // Keeps the hover buttons pressable: without this the block's own drag wins
  // the mousedown. See lib/dnd/dragGuard.ts.
  const drag = useDragGuard()
  const handleClass =
    'absolute top-0 bottom-0 z-10 w-2.5 cursor-ew-resize rounded-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/10'

  return (
    <div
      data-block
      draggable={drag.draggable && !isResizing}
      onPointerDownCapture={drag.onPointerDownCapture}
      onDragStart={drag.guardDragStart((event) => {
        onDragStateChange(true)
        event.dataTransfer.setData('text/plain', `entry:${entry.id}`)
        event.dataTransfer.effectAllowed = 'move'
      })}
      onDragEnd={() => onDragStateChange(false)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        // A task opens its detail dialog. An activity has none, so its body
        // click falls through to the thing it does have: its schedule.
        if (task) onOpenDetail(task)
        else onOpenSchedule({ subject, entryId: entry.id }, { x: event.clientX, y: event.clientY })
      }}
      tabIndex={0}
      title={`${text} · ${timeLabel}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // React's onFocus/onBlur bubble, so these fire for the action buttons too.
      // The relatedTarget check is what makes tabbing *into* one of those
      // buttons not read as leaving the block.
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
      className={cn(
        'group absolute flex cursor-grab flex-col justify-center overflow-visible rounded-md border-l-4',
        'bg-muted/70 shadow-sm transition-[width,left,box-shadow] duration-150 hover:shadow-md active:cursor-grabbing',
        'focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none',
        // Narrow blocks give the title back the padding it would otherwise
        // spend on margins — at 40px wide, 20px of padding is half the block.
        isNarrow && !isExpanded ? 'px-1 py-1' : 'px-2.5 py-1',
        isDragging && 'opacity-40',
        completed && 'opacity-60',
      )}
      style={{
        left: renderedLeft,
        width,
        top: AXIS_H + lane * LANE_H,
        height: LANE_H - LANE_GAP,
        borderLeftColor: accent,
        // Above its neighbours only while grown, so an expanded block covers
        // the one it overlaps rather than being covered by it.
        zIndex: isExpanded ? 20 : undefined,
      }}
    >
      <BlockContents
        text={text}
        timeLabel={timeLabel}
        titleRef={titleRef}
        completed={completed}
        isTracked={isTracked}
        actions={isNarrow ? (isExpanded ? 'always' : 'none') : 'hover'}
        onOpenSchedule={(anchor) => onOpenSchedule({ subject, entryId: entry.id }, anchor)}
        onStartTracking={() => startTracking(subject)}
      />

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
