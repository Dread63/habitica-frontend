import * as React from 'react'
import { CheckCheck, ChevronDown, Plus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { useDragGuard } from '@/lib/dnd/useDragGuard'
import type { Task, TaskType } from '@/lib/habitica/types'
import { TASK_TYPE_META } from '@/features/tasks/taskType'
import { formatDueDate, getDueDate, isOverdue, sortTasksByDueDate } from '@/features/tasks/taskDueDate'
import { searchTasks } from '@/features/tasks/taskSearch'
import { TaskSearchBar } from '@/features/tasks/TaskSearchBar'
import { recentActivities, searchActivities, type ActivitySuggestion } from '@/features/activities/recentActivities'
import { subjectOfActivity, type TimeSubject } from '@/features/activities/subject'
import { useTimelineEntryStore } from './timelineEntryStore'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'

interface UnscheduledTaskListProps {
  tasks: Task[]
  /** A task or an ad-hoc activity was chosen — open the schedule popover for it. */
  onSchedule: (subject: Task | TimeSubject, anchor: { x: number; y: number }) => void
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
 *
 * **Search is `searchTasks` verbatim** — the Dashboard's engine, title →
 * subtask → notes, with the same `TaskSearchBar` control. That is the whole
 * point: this list used to be an unsearchable wall of every schedulable task,
 * and finding something here should mean exactly what it means on the
 * Dashboard rather than being a second, subtly different search.
 *
 * Activities get their own group below the tasks. They are matched on their
 * label only (all they have), and a query matching nothing offers to schedule
 * itself as a new one — which is the entire "create an activity" flow.
 */
export function UnscheduledTaskList({ tasks, onSchedule }: UnscheduledTaskListProps) {
  const [query, setQuery] = React.useState('')
  const [collapsed, setCollapsed] = React.useState<Partial<Record<TaskType, boolean>>>({})

  const searching = query.trim().length > 0
  const matched = React.useMemo(() => searchTasks(tasks, query), [tasks, query])

  // Dailies get the same due-date sort as to-dos — getDueDate reads their
  // server-computed nextDue[0], so "soonest first" is meaningful there too.
  const groups = GROUP_ORDER.map((g) => {
    const ofType = matched.filter((t) => t.type === g.type)
    return { ...g, tasks: g.type === 'habit' ? ofType : sortTasksByDueDate(ofType) }
  })

  const ledger = useTimeEntryStore((s) => s.entries)
  const plan = useTimelineEntryStore((s) => s.entries)
  const activities = React.useMemo(() => recentActivities(ledger, plan), [ledger, plan])
  const matchedActivities = React.useMemo(() => searchActivities(activities, query), [activities, query])

  // Offer to create only when the typed label isn't already an activity —
  // otherwise it would appear twice, once as a suggestion and once as new.
  const draft = subjectOfActivity(query)
  const canCreate = draft !== null && !activities.some((a) => a.id === draft.id)

  const nothingMatches = matched.length === 0 && matchedActivities.length === 0 && !canCreate

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Unscheduled{' '}
        <span className="text-muted-foreground/70">
          ({searching ? `${matched.length} of ${tasks.length}` : tasks.length})
        </span>
      </h2>

      <TaskSearchBar value={query} onChange={setQuery} />

      {tasks.length === 0 && !searching ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-sm text-muted-foreground">
          <CheckCheck className="size-4" /> Everything's on the timeline.
        </p>
      ) : nothingMatches ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No matches.
        </p>
      ) : (
        <div className="flex max-h-[60dvh] flex-col gap-4 overflow-y-auto pr-1">
          {groups
            .filter((g) => g.tasks.length > 0)
            .map((g) => {
              const { icon: TypeIcon, accent } = TASK_TYPE_META[g.type]
              // A collapsed group while searching would hide the very rows the
              // query just found, so search overrides the collapse state
              // rather than fighting it.
              const isCollapsed = !searching && collapsed[g.type] === true
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

          {(matchedActivities.length > 0 || canCreate) && (
            <div className="flex flex-col gap-1.5">
              <div
                className="flex items-center gap-1.5 border-b pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                style={{ borderBottomColor: 'color-mix(in oklab, var(--muted-foreground) 35%, transparent)' }}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                Activities{' '}
                <span className="font-normal text-muted-foreground/70">({matchedActivities.length})</span>
              </div>
              {matchedActivities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} onSchedule={onSchedule} />
              ))}
              {canCreate && (
                <button
                  type="button"
                  onClick={(event) => onSchedule(draft, { x: event.clientX, y: event.clientY })}
                  title="Plan this on the timeline as an activity"
                  className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Plus className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    Schedule “<span className="font-medium">{draft.text}</span>”
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!searching && (
        <p className="text-[11px] text-muted-foreground/70">
          Search finds titles, subtasks and descriptions. Type a name that isn't a task to plan it as an activity.
        </p>
      )}
    </section>
  )
}

/** Shared chrome for both row kinds — one accent bar, one draggable button. */
function SubjectRow({
  subjectId,
  text,
  accent,
  title,
  strikethrough = false,
  trailing,
  onSchedule,
}: {
  subjectId: string
  text: string
  accent: string
  title: string
  strikethrough?: boolean
  trailing?: React.ReactNode
  onSchedule: (anchor: { x: number; y: number }) => void
}) {
  // Same two-step emoji pipeline as TaskCard: shortcodes -> unicode
  // (emojify), then Twemoji swaps in consistent images.
  const textRef = useTwemoji<HTMLSpanElement>([text])
  // The row is itself a <button>, so the guard's source-exclusion rule is what
  // keeps this draggable at all — see lib/dnd/dragGuard.ts.
  const drag = useDragGuard()

  return (
    <button
      type="button"
      draggable={drag.draggable}
      onPointerDownCapture={drag.onPointerDownCapture}
      onDragStart={drag.guardDragStart((event) => {
        event.dataTransfer.setData('text/plain', `subject:${subjectId}`)
        event.dataTransfer.effectAllowed = 'move'
      })}
      onClick={(event) => onSchedule({ x: event.clientX, y: event.clientY })}
      title={title}
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-md border border-border bg-card py-2 pr-2.5 pl-2',
        'border-l-[3px] text-left text-sm transition-colors hover:bg-muted active:cursor-grabbing',
      )}
      style={{ borderLeftColor: accent }}
    >
      <span
        ref={textRef}
        className={cn('min-w-0 flex-1 truncate', strikethrough && 'text-muted-foreground line-through')}
      >
        {emojify(text)}
      </span>
      {trailing}
    </button>
  )
}

function UnscheduledRow({
  task,
  onSchedule,
}: {
  task: Task
  onSchedule: (subject: Task, anchor: { x: number; y: number }) => void
}) {
  const { accent, label } = TASK_TYPE_META[task.type]
  const completed = 'completed' in task && task.completed
  const due = getDueDate(task)
  const overdue = isOverdue(task)

  return (
    <SubjectRow
      subjectId={task.id}
      text={task.text}
      accent={accent}
      title={`${label} — drag onto the timeline, or click to schedule`}
      strikethrough={completed === true}
      onSchedule={(anchor) => onSchedule(task, anchor)}
      trailing={
        // The due date is what put this row where it is in the list — showing
        // it is what makes the ordering legible rather than mysterious.
        due ? (
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap tabular-nums',
              overdue ? 'bg-destructive/10 font-medium text-destructive' : 'text-muted-foreground',
            )}
          >
            {formatDueDate(due)}
          </span>
        ) : undefined
      }
    />
  )
}

function ActivityRow({
  activity,
  onSchedule,
}: {
  activity: ActivitySuggestion
  onSchedule: (subject: TimeSubject, anchor: { x: number; y: number }) => void
}) {
  return (
    <SubjectRow
      subjectId={activity.id}
      text={activity.text}
      accent="var(--muted-foreground)"
      title="Activity — drag onto the timeline, or click to schedule"
      onSchedule={(anchor) => onSchedule(activity, anchor)}
    />
  )
}
