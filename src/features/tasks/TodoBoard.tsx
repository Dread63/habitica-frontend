import * as React from 'react'
import { CalendarClock, CheckCheck, Inbox, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CalendarGrid } from '@/components/ui/DatePicker'
import { cn } from '@/lib/utils'
import { addDays, toApiDateTime, today } from '@/lib/dateOnly'
import type { TodoTask } from '@/lib/habitica/types'
import { TaskCard } from './TaskCard'
import { TaskEditorDialog, type TaskEditorHandle } from './TaskEditorDialog'
import { TASK_TYPE_META } from './taskType'
import { useUpdateTask } from './taskMutations'
import { TODO_BUCKET_HINTS, TODO_BUCKET_LABELS, TODO_BUCKET_ORDER, bucketOf, groupTodosByDueDate, type TodoBucket } from './todoBuckets'

interface TodoBoardProps {
  tasks: TodoTask[]
  tagNamesById: ReadonlyMap<string, string>
  isFiltered: boolean
  /** When true, split into the four due-date columns; otherwise flow one list across columns. */
  grouped: boolean
  completedVisible: boolean
  onToggleCompletedVisible: () => void
  scheduledOnly: boolean
  onToggleScheduledOnly: () => void
}

/** Where the mini date picker opens after a card is dropped on "Later" — pinned near the
 * drop point (clamped to stay on-screen) rather than centered, so it reads as attached to
 * the card you just moved. */
interface LaterPickerState {
  taskId: string
  x: number
  y: number
}

const POPOVER_WIDTH = 256 // matches CalendarGrid's w-64
const POPOVER_HEIGHT = 320 // generous estimate — actual height varies with the month's row count

/**
 * To-Dos gets its own component rather than reusing TaskColumn, because
 * it's the one list that actually runs long and so is the only one that
 * earns the wide main area: it spreads across multiple columns either as
 * four due-date buckets (grouped) or as one continuous list flowed
 * top-to-bottom, left-to-right (ungrouped). Habits/Dailies/Rewards stay on
 * TaskColumn in the narrow rail.
 *
 * Grouped view is also where drag-and-drop lives — dragging a card into a
 * different bucket re-dates it (see `dateForDrop`). This is native HTML5
 * drag-and-drop (no dependency), which means it's mouse/trackpad-only —
 * there's no touch-screen equivalent without a polyfill, and no keyboard
 * equivalent either. Neither is a dead end, though: the pencil icon on
 * every card always opens the full editor with the same themed
 * `DatePicker`, so drag-and-drop is a shortcut on top of a fully
 * accessible path, not the only way to change a due date.
 */
export function TodoBoard({
  tasks,
  tagNamesById,
  isFiltered,
  grouped,
  completedVisible,
  onToggleCompletedVisible,
  scheduledOnly,
  onToggleScheduledOnly,
}: TodoBoardProps) {
  const createDialogRef = React.useRef<TaskEditorHandle>(null)
  const updateTask = useUpdateTask()
  const { icon: TypeIcon, accent } = TASK_TYPE_META.todo

  const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(null)
  const [dragOverBucket, setDragOverBucket] = React.useState<TodoBucket | null>(null)
  const [laterPicker, setLaterPicker] = React.useState<LaterPickerState | null>(null)

  // Recomputed per render rather than memoized on a frozen `now`: bucketing
  // is date-dependent, and pinning "now" in a dep array would leave a tab
  // left open overnight showing yesterday's idea of "today".
  const buckets = grouped ? groupTodosByDueDate(tasks) : null

  function handleDrop(taskId: string, bucket: TodoBucket, clientX: number, clientY: number) {
    setDragOverBucket(null)
    const task = tasks.find((t) => t.id === taskId)
    // Already sitting in the bucket it was dropped on — nothing to do
    // (also covers dropping a card back onto its own bucket).
    if (task && bucketOf(task) === bucket && bucket !== 'later') return

    if (bucket === 'today') {
      updateTask.mutate({ taskId, input: { date: toApiDateTime(today()) } })
    } else if (bucket === 'week') {
      // Exactly 7 days from today, per spec — not "sometime this rolling
      // week", which for a task dropped in on a Saturday would mean almost
      // no time at all.
      updateTask.mutate({ taskId, input: { date: toApiDateTime(addDays(today(), 7)) } })
    } else if (bucket === 'someday') {
      updateTask.mutate({ taskId, input: { date: null } })
    } else if (bucket === 'later') {
      // No fixed offset makes sense for "later" — open the mini picker
      // instead of guessing a date.
      setLaterPicker({ taskId, x: clientX, y: clientY })
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div
        className="flex items-center justify-between border-b-2 px-1 pb-2"
        style={{ borderBottomColor: `color-mix(in oklab, ${accent} 35%, transparent)` }}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <TypeIcon className="size-4" style={{ color: accent }} aria-hidden="true" />
          To-Dos <span className="text-muted-foreground/70">({tasks.length})</span>
        </h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={scheduledOnly ? 'Show all to-dos' : 'Show only scheduled to-dos'}
            aria-pressed={scheduledOnly}
            title={scheduledOnly ? 'Showing scheduled only' : 'Show scheduled only'}
            onClick={onToggleScheduledOnly}
          >
            <CalendarClock className={cn('size-4', scheduledOnly && 'text-primary')} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={completedVisible ? 'Hide completed' : 'Show completed'}
            aria-pressed={completedVisible}
            title={completedVisible ? 'Showing completed' : 'Hiding completed'}
            onClick={onToggleCompletedVisible}
          >
            <CheckCheck className={cn('size-4', completedVisible && 'text-primary')} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="New todo"
            onClick={() => createDialogRef.current?.open()}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        isFiltered ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-10 text-center">
            <Inbox className="size-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">No matches.</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => createDialogRef.current?.open()}
            className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-10 text-center transition-colors hover:border-muted-foreground/40 hover:bg-muted/50"
          >
            <Inbox className="size-6 text-muted-foreground/50" />
            <span className="text-sm text-muted-foreground">Nothing here — add one</span>
          </button>
        )
      ) : buckets ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
          {TODO_BUCKET_ORDER.map((bucket) => (
            <div
              key={bucket}
              onDragOver={(event) => {
                event.preventDefault() // required for onDrop to fire at all
                event.dataTransfer.dropEffect = 'move'
                setDragOverBucket((prev) => (prev === bucket ? prev : bucket))
              }}
              onDragLeave={() => setDragOverBucket((prev) => (prev === bucket ? null : prev))}
              onDrop={(event) => {
                event.preventDefault()
                const taskId = event.dataTransfer.getData('text/plain')
                if (taskId) handleDrop(taskId, bucket, event.clientX, event.clientY)
              }}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-lg p-1 transition-colors',
                dragOverBucket === bucket && 'bg-primary/5 ring-2 ring-primary/40',
              )}
            >
              <div className="flex items-baseline justify-between gap-2 px-1">
                <h3
                  className="text-xs font-semibold uppercase tracking-wide"
                  title={TODO_BUCKET_HINTS[bucket]}
                >
                  {TODO_BUCKET_LABELS[bucket]}{' '}
                  <span className="font-normal text-muted-foreground/70">({buckets[bucket].length})</span>
                </h3>
              </div>
              {buckets[bucket].length === 0 ? (
                // Quiet on purpose: an empty "Today & overdue" is good news,
                // not a state that should shout for attention. Still a valid
                // drop target even while empty (the ring/tint above covers it).
                <p className="px-1 text-xs text-muted-foreground/60">
                  {dragOverBucket === bucket ? 'Drop to move here' : 'Nothing here.'}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {buckets[bucket].map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(event) => {
                        setDraggingTaskId(task.id)
                        event.dataTransfer.setData('text/plain', task.id)
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => setDraggingTaskId(null)}
                      className={cn('cursor-grab active:cursor-grabbing', draggingTaskId === task.id && 'opacity-40')}
                    >
                      <TaskCard task={task} tagNamesById={tagNamesById} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        // CSS multi-column (not a grid) so one continuous list flows down
        // each column then into the next — reading order stays top-to-bottom
        // per column, which is how a list is meant to be read. A grid would
        // instead put items 1/2/3 side by side across the first row.
        // `break-inside-avoid` keeps a card from being split across columns.
        <div className="columns-1 gap-5 md:columns-2 xl:columns-3">
          {tasks.map((task) => (
            <div key={task.id} className="mb-3 break-inside-avoid">
              <TaskCard task={task} tagNamesById={tagNamesById} />
            </div>
          ))}
        </div>
      )}

      {laterPicker && (
        <LaterDatePopover
          x={laterPicker.x}
          y={laterPicker.y}
          onSelect={(date) => {
            updateTask.mutate({ taskId: laterPicker.taskId, input: { date: toApiDateTime(date) } })
            setLaterPicker(null)
          }}
          onCancel={() => setLaterPicker(null)}
        />
      )}

      <TaskEditorDialog ref={createDialogRef} mode="create" type="todo" />
    </section>
  )
}

/**
 * The "small window to select a specific date" for a card dropped on
 * "Later" — the bare `CalendarGrid` (no trigger/input chrome, unlike
 * `DatePicker`) in a fixed-position popover pinned near the drop point.
 * Closes on picking a day, clicking outside, or Escape; never shows a
 * "Clear" option — dropping a card here is always setting a date, and
 * clearing one is what the Someday bucket is for.
 */
function LaterDatePopover({
  x,
  y,
  onSelect,
  onCancel,
}: {
  x: number
  y: number
  onSelect: (date: Date) => void
  onCancel: () => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onCancel()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onCancel])

  const left = Math.min(Math.max(x - POPOVER_WIDTH / 2, 8), window.innerWidth - POPOVER_WIDTH - 8)
  const top = Math.min(y, window.innerHeight - POPOVER_HEIGHT - 8)

  return (
    <div ref={ref} className="fixed z-30" style={{ left, top }}>
      <CalendarGrid value={null} onChange={onSelect} />
    </div>
  )
}
