import * as React from 'react'
import { CheckCheck, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import type { Task, TaskType } from '@/lib/habitica/types'
import { TASK_TYPE_META } from '@/features/tasks/taskType'
import { formatDueDate, getDueDate, isOverdue, sortTasksByDueDate } from '@/features/tasks/taskDueDate'

interface UnscheduledTaskListProps {
  tasks: Task[]
  onSchedule: (task: Task, anchor: { x: number; y: number }) => void
}

/**
 * To-Dos first, then dailies, then habits — deliberately *not* the
 * Dashboard rail's order. This list answers "what should I put on the
 * calendar next?", and the answer is almost always a deadline-bearing to-do;
 * habits are quick reps you rarely block time for, so they sit at the
 * bottom. Within To-Dos, soonest-due first (which puts anything overdue at
 * the very top) with undated ones last, via the same `sortTasksByDueDate`
 * the Dashboard uses.
 */
const GROUP_ORDER: { type: TaskType; title: string }[] = [
  { type: 'todo', title: 'To-Dos' },
  { type: 'daily', title: 'Dailies' },
  { type: 'habit', title: 'Habits' },
]

/**
 * The drag source rail, grouped by task type. Rows are deliberately
 * lighter than TaskCard — no score/edit/delete controls here, this list
 * exists to be dragged from (or clicked, the accessible path, which opens
 * ScheduleFields). Tag filtering happens upstream in TimelinePage via the
 * same global filter the Dashboard uses (TagFilterSidebar renders below
 * this list in the rail).
 */
export function UnscheduledTaskList({ tasks, onSchedule }: UnscheduledTaskListProps) {
  // Dailies get the same due-date sort as to-dos — getDueDate reads their
  // server-computed nextDue[0], so "soonest first" is meaningful there too.
  const groups = GROUP_ORDER.map((g) => {
    const ofType = tasks.filter((t) => t.type === g.type)
    return { ...g, tasks: g.type === 'habit' ? ofType : sortTasksByDueDate(ofType) }
  })
  const [collapsed, setCollapsed] = React.useState<Partial<Record<TaskType, boolean>>>({})

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Unscheduled <span className="text-muted-foreground/70">({tasks.length})</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
          <CheckCheck className="size-4" /> Everything's on the timeline.
        </p>
      ) : (
        <div className="flex max-h-[60dvh] flex-col gap-4 overflow-y-auto pr-1">
          {groups
            .filter((g) => g.tasks.length > 0)
            .map((g) => {
              const { icon: TypeIcon, accent } = TASK_TYPE_META[g.type]
              const isCollapsed = collapsed[g.type] === true
              return (
                <div key={g.type} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => setCollapsed((c) => ({ ...c, [g.type]: !isCollapsed }))}
                    className="flex items-center gap-1.5 border-b pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
                    style={{ borderBottomColor: `color-mix(in oklab, ${accent} 35%, transparent)` }}
                  >
                    <TypeIcon className="size-3.5" style={{ color: accent }} aria-hidden="true" />
                    {g.title} <span className="font-normal text-muted-foreground/70">({g.tasks.length})</span>
                    <ChevronDown
                      className={cn('ml-auto size-3.5 transition-transform', isCollapsed && '-rotate-90')}
                      aria-hidden="true"
                    />
                  </button>
                  {!isCollapsed &&
                    g.tasks.map((task) => <UnscheduledRow key={task.id} task={task} onSchedule={onSchedule} />)}
                </div>
              )
            })}
        </div>
      )}
    </section>
  )
}

function UnscheduledRow({
  task,
  onSchedule,
}: {
  task: Task
  onSchedule: (task: Task, anchor: { x: number; y: number }) => void
}) {
  const { accent, label } = TASK_TYPE_META[task.type]
  const completed = 'completed' in task && task.completed
  // Same two-step emoji pipeline as TaskCard: shortcodes -> unicode
  // (emojify), then Twemoji swaps in consistent images.
  const textRef = useTwemoji<HTMLSpanElement>([task.text])
  const due = getDueDate(task)
  const overdue = isOverdue(task)

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', `task:${task.id}`)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onClick={(event) => onSchedule(task, { x: event.clientX, y: event.clientY })}
      title={`${label} — drag onto the timeline, or click to schedule`}
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-md border border-border bg-card py-2 pr-2.5 pl-2',
        'border-l-[3px] text-left text-sm transition-colors hover:bg-muted active:cursor-grabbing',
      )}
      style={{ borderLeftColor: accent }}
    >
      <span
        ref={textRef}
        className={cn('min-w-0 flex-1 truncate', completed && 'text-muted-foreground line-through')}
      >
        {emojify(task.text)}
      </span>
      {/* The due date is what put this row where it is in the list — showing
          it is what makes the ordering legible rather than mysterious. */}
      {due && (
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap tabular-nums',
            overdue ? 'bg-destructive/10 font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {formatDueDate(due)}
        </span>
      )}
    </button>
  )
}
