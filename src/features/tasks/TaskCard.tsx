import { Circle, CircleCheck, ChevronUp, ChevronDown, Coins, Flame } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/habitica/types'
import { PRIORITY_LABELS } from './priority'

interface TaskCardProps {
  task: Task
  /** Tag id -> name, so cards can show tag names without each doing its own lookup. */
  tagNamesById: ReadonlyMap<string, string>
}

/**
 * Read-only for Phase 1 — displays state (completed, streak, up/down
 * availability) but scoring/editing interactions land in Phase 2. The
 * indicator icons are deliberately non-interactive here, not disabled
 * buttons, so nothing implies functionality that isn't wired up yet.
 */
export function TaskCard({ task, tagNamesById }: TaskCardProps) {
  return (
    <Card className="flex items-start gap-3 p-3">
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        <Indicator task={task} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className={cn(
            'text-sm leading-snug',
            'completed' in task && task.completed && 'text-muted-foreground line-through',
          )}
        >
          {task.text}
        </p>
        {task.notes && <p className="truncate text-xs text-muted-foreground">{task.notes}</p>}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.type === 'daily' && task.streak > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Flame className="size-3" /> {task.streak}
            </span>
          )}
          {task.type === 'reward' && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Coins className="size-3" /> {task.value}
            </span>
          )}
          {task.tags.map((tagId) => (
            <span
              key={tagId}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {tagNamesById.get(tagId) ?? '…'}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

function Indicator({ task }: { task: Task }) {
  if (task.type === 'habit') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <ChevronUp className={cn('size-3.5', !task.up && 'opacity-25')} />
        <ChevronDown className={cn('size-3.5', !task.down && 'opacity-25')} />
      </div>
    )
  }
  if (task.type === 'reward') {
    return <Coins className="size-4" />
  }
  // daily / todo
  return task.completed ? <CircleCheck className="size-4 text-primary" /> : <Circle className="size-4" />
}
