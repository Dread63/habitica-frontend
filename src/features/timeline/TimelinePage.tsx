import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/habitica/types'
import { addDays, isSameDate, parseDateOnlyString, today, toDateOnlyString } from '@/lib/dateOnly'
import { useTasks, useTaskLookup } from '@/features/tasks/useTasks'
import { TaskDetailDialogHost } from '@/features/tasks/TaskDetailDialogHost'
import { useTagFilterStore } from '@/features/tags/tagFilterStore'
import { filterTasksByTags } from '@/features/tags/tagFilter'
import { TagFilterSidebar } from '@/features/tags/TagFilterSidebar'
import { PomodoroPanel } from '@/features/pomodoro/PomodoroPanel'
import { PomodoroDayStats } from '@/features/pomodoro/PomodoroDayStats'
import { entriesForDate } from './timelineEntries'
import { useTimelineEntryStore } from './timelineEntryStore'
import { unscheduledTasks } from './timelineEligibility'
import { TimelineScrubber } from './TimelineScrubber'
import { UnscheduledTaskList } from './UnscheduledTaskList'
import { SchedulePopover } from './SchedulePopover'

/**
 * The /timeline route: a per-day horizontal schedule, entirely local to
 * this app (Habitica has no concept of it). Day navigation lives in a
 * ?date= URL param — bookmarkable, refresh-safe, and keeps the entry store
 * itself date-agnostic. The unscheduled rail honors the same global tag
 * filter as the Dashboard (one filter concept, not a parallel one).
 */
export function TimelinePage() {
  const tasksQuery = useTasks()
  const entries = useTimelineEntryStore((s) => s.entries)
  const tagFilter = useTagFilterStore((s) => s.filter)
  const [searchParams, setSearchParams] = useSearchParams()

  const todayStr = toDateOnlyString(today())
  const dateParam = searchParams.get('date')
  const viewDate = dateParam && parseDateOnlyString(dateParam) ? dateParam : todayStr
  const viewedDay = parseDateOnlyString(viewDate) ?? today()
  const isToday = isSameDate(viewedDay, today())

  const [popover, setPopover] = React.useState<{ task: Task; x: number; y: number } | null>(null)
  // Held as an *id*, not the Task object the click carried: the dialog edits
  // the task (checklist ticks, in-place title/notes edits), and a frozen
  // snapshot would keep rendering the pre-edit copy.
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null)

  function setViewDate(date: string) {
    setSearchParams(date === todayStr ? {} : { date }, { replace: true })
  }

  const dayEntries = React.useMemo(() => entriesForDate(entries, viewDate), [entries, viewDate])

  // Blocks resolve against the *completed-inclusive* lookup: a to-do drops
  // out of GET /tasks/user the moment it's ticked off, which used to leave
  // its block reading "Deleted task" (see useTaskLookup).
  const tasksById = useTaskLookup()

  const unscheduled = React.useMemo(
    // The pick-list stays on open tasks only — a finished to-do isn't
    // something to schedule — and the tag filter narrows it. Already-placed
    // blocks always render regardless, since hiding a scheduled block
    // because of a filter would misrepresent the day being reviewed.
    () => unscheduledTasks(filterTasksByTags(tasksQuery.data ?? [], tagFilter), entries, viewDate),
    [tasksQuery.data, tagFilter, entries, viewDate],
  )

  const detailTask = detailTaskId === null ? undefined : tasksById.get(detailTaskId)

  const dayLabel = viewedDay.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="flex min-h-dvh w-full flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{dayLabel}</h1>
          {isToday && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Today</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous day"
            onClick={() => setViewDate(toDateOnlyString(addDays(viewedDay, -1)))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isToday}
            onClick={() => setViewDate(todayStr)}
            className={cn(isToday && 'opacity-50')}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next day"
            onClick={() => setViewDate(toDateOnlyString(addDays(viewedDay, 1)))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      {tasksQuery.isPending && (
        <div className="flex flex-col gap-4">
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      )}

      {tasksQuery.isError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm text-destructive">Couldn't load tasks: {tasksQuery.error.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void tasksQuery.refetch()}>
            <RefreshCw className="size-3" /> Try again
          </Button>
        </div>
      )}

      {tasksQuery.isSuccess && (
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* Rail: the live pomodoro donut on top (the "left monitor" view —
              timeline moving beside a counting-down ring), then the
              unscheduled pick-list, then the same global tag filter the
              Dashboard uses (it narrows the pick-list above it). Sticks and
              scrolls independently, like the Dashboard rail. */}
          <div className="flex w-full shrink-0 flex-col gap-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:w-80 lg:overflow-y-auto lg:pr-2 xl:w-96">
            <PomodoroPanel />
            <UnscheduledTaskList
              tasks={unscheduled}
              onSchedule={(task, anchor) => setPopover({ task, ...anchor })}
            />
            <div className="border-t border-border pt-4">
              <TagFilterSidebar />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <TimelineScrubber
              date={viewDate}
              entries={dayEntries}
              tasksById={tasksById}
              onOpenSchedule={(task, anchor) => setPopover({ task, ...anchor })}
              onOpenDetail={(task) => setDetailTaskId(task.id)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Click a block to open the task · drag to move · drag its edges to resize · its clock button types exact
              times · drag empty space to pan · scroll to zoom. Placements live only in this app — habitica.com never
              sees them.
            </p>
            <PomodoroDayStats date={viewDate} />
          </div>
        </div>
      )}

      {popover && (
        <SchedulePopover
          x={popover.x}
          y={popover.y}
          task={popover.task}
          initialDate={viewDate}
          onClose={() => setPopover(null)}
        />
      )}

      {/* Keyed by task id so clicking a second block swaps the dialog's
          contents rather than reusing the first task's form state. */}
      {detailTask && (
        <TaskDetailDialogHost key={detailTask.id} task={detailTask} onClose={() => setDetailTaskId(null)} />
      )}
    </div>
  )
}
