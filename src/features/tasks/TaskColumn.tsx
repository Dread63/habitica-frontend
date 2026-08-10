import * as React from 'react'
import { Inbox, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Task } from '@/lib/habitica/types'
import { TaskCard } from './TaskCard'
import { TaskEditorDialog, type TaskEditorHandle } from './TaskEditorDialog'
import { TASK_TYPE_META } from './taskType'

interface TaskColumnProps {
  type: Task['type']
  title: string
  tasks: Task[]
  tagNamesById: ReadonlyMap<string, string>
  /**
   * True when a tag filter and/or search query is currently narrowing the
   * task list. Distinguishes a genuinely empty column (offer to add a task)
   * from one that's merely filtered/searched down to zero matches, where
   * "add one" would be a misleading thing to suggest.
   */
  isFiltered: boolean
}

export function TaskColumn({ type, title, tasks, tagNamesById, isFiltered }: TaskColumnProps) {
  const createDialogRef = React.useRef<TaskEditorHandle>(null)
  const { icon: TypeIcon, accent } = TASK_TYPE_META[type]

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div
        className="flex items-center justify-between border-b-2 px-1 pb-1.5"
        style={{ borderBottomColor: `color-mix(in oklab, ${accent} 35%, transparent)` }}
      >
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TypeIcon className="size-3.5" style={{ color: accent }} aria-hidden="true" />
          {title} <span className="text-muted-foreground/70">({tasks.length})</span>
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label={`New ${type}`}
          onClick={() => createDialogRef.current?.open()}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
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
      <TaskEditorDialog ref={createDialogRef} mode="create" type={type} />
    </section>
  )
}
