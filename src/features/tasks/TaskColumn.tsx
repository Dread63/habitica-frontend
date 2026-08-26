import * as React from 'react'
import { CalendarClock, CheckCheck, ChevronDown, ChevronRight, Inbox, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/habitica/types'
import { TaskCard } from './TaskCard'
import { TaskEditorDialog, type TaskEditorHandle } from './TaskEditorDialog'
import { TASK_TYPE_META } from './taskType'
import { useRailSectionsStore } from './railSectionsStore'

interface TaskColumnProps {
  type: Task['type']
  title: string
  tasks: Task[]
  tagNamesById: ReadonlyMap<string, string>
  /**
   * True when a tag filter, search query, and/or this column's own
   * completed/scheduled-only toggles are currently narrowing the task list.
   * Distinguishes a genuinely empty column (offer to add a task) from one
   * that's merely filtered/searched down to zero matches, where "add one"
   * would be a misleading thing to suggest.
   */
  isFiltered: boolean
  /** Daily/todo columns only — omitted (no icon shown) for habit/reward. */
  completedVisible?: boolean
  onToggleCompletedVisible?: () => void
  /** Todo column only. */
  scheduledOnly?: boolean
  onToggleScheduledOnly?: () => void
  /**
   * Rail sections (Habits/Dailies/Rewards, rendered in the left rail next
   * to the tag filter — see Dashboard.tsx) are collapsible, remember that
   * state via railSectionsStore, and cap their list at 45dvh with internal
   * scroll once expanded — the direct answer to "this needs to scale past
   * ~10 habits without the rail just growing forever." The main To-Dos
   * column (the one list that's *supposed* to take the page's full height)
   * leaves this off.
   */
  collapsible?: boolean
}

export function TaskColumn({
  type,
  title,
  tasks,
  tagNamesById,
  isFiltered,
  completedVisible,
  onToggleCompletedVisible,
  scheduledOnly,
  onToggleScheduledOnly,
  collapsible = false,
}: TaskColumnProps) {
  const createDialogRef = React.useRef<TaskEditorHandle>(null)
  const { icon: TypeIcon, accent } = TASK_TYPE_META[type]
  const collapsedInStore = useRailSectionsStore((s) => s.collapsed[type as 'habit' | 'daily' | 'reward'])
  const toggleCollapsed = useRailSectionsStore((s) => s.toggleSection)
  const collapsed = collapsible && collapsedInStore

  const countLabel = <span className="text-muted-foreground/70">({tasks.length})</span>

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div
        className="flex items-center justify-between border-b-2 px-1 pb-1.5"
        style={{ borderBottomColor: `color-mix(in oklab, ${accent} 35%, transparent)` }}
      >
        {collapsible ? (
          <button
            type="button"
            onClick={() => toggleCollapsed(type as 'habit' | 'daily' | 'reward')}
            aria-expanded={!collapsed}
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
            <TypeIcon className="size-4" style={{ color: accent }} aria-hidden="true" />
            {title} {countLabel}
          </button>
        ) : (
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <TypeIcon className="size-4" style={{ color: accent }} aria-hidden="true" />
            {title} {countLabel}
          </h2>
        )}
        <div className="flex items-center gap-0.5">
          {onToggleScheduledOnly && (
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
          )}
          {onToggleCompletedVisible && (
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
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`New ${type}`}
            onClick={() => createDialogRef.current?.open()}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      {!collapsed && (
        // The per-section cap only kicks in for a genuinely long section —
        // it exists so one huge Habits list can't push Dailies and Rewards
        // off the bottom of the rail's own scroll. Collapse handles the
        // rest.
        <div className={cn('flex flex-col gap-3', collapsible && 'max-h-[55dvh] overflow-y-auto pr-1')}>
          {tasks.length === 0 && isFiltered && (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-6 text-center">
              <Inbox className="size-5 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">No matches.</span>
            </div>
          )}
          {tasks.length === 0 && !isFiltered && (
            <button
              type="button"
              onClick={() => createDialogRef.current?.open()}
              className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-3 py-6 text-center transition-colors hover:border-muted-foreground/40 hover:bg-muted/50"
            >
              <Inbox className="size-5 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">Nothing here — add one</span>
            </button>
          )}
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} tagNamesById={tagNamesById} />
          ))}
        </div>
      )}
      <TaskEditorDialog ref={createDialogRef} mode="create" type={type} />
    </section>
  )
}
