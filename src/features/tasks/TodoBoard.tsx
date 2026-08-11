import * as React from 'react'
import { CalendarClock, CheckCheck, Inbox, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TodoTask } from '@/lib/habitica/types'
import { TaskCard } from './TaskCard'
import { TaskEditorDialog, type TaskEditorHandle } from './TaskEditorDialog'
import { TASK_TYPE_META } from './taskType'
import { TODO_BUCKET_HINTS, TODO_BUCKET_LABELS, TODO_BUCKET_ORDER, groupTodosByDueDate } from './todoBuckets'

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

/**
 * To-Dos gets its own component rather than reusing TaskColumn, because
 * it's the one list that actually runs long and so is the only one that
 * earns the wide main area: it spreads across multiple columns either as
 * four due-date buckets (grouped) or as one continuous list flowed
 * top-to-bottom, left-to-right (ungrouped). Habits/Dailies/Rewards stay on
 * TaskColumn in the narrow rail.
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
  const { icon: TypeIcon, accent } = TASK_TYPE_META.todo

  // Recomputed per render rather than memoized on a frozen `now`: bucketing
  // is date-dependent, and pinning "now" in a dep array would leave a tab
  // left open overnight showing yesterday's idea of "today".
  const buckets = grouped ? groupTodosByDueDate(tasks) : null

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
            <div key={bucket} className="flex min-w-0 flex-col gap-2">
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
                // not a state that should shout for attention.
                <p className="px-1 text-xs text-muted-foreground/60">Nothing here.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {buckets[bucket].map((task) => (
                    <TaskCard key={task.id} task={task} tagNamesById={tagNamesById} />
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

      <TaskEditorDialog ref={createDialogRef} mode="create" type="todo" />
    </section>
  )
}
