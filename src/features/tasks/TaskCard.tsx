import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Circle, CircleCheck, ChevronUp, ChevronDown, Coins, Flame } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTwemoji } from '@/lib/useTwemoji'
import type { Task } from '@/lib/habitica/types'
import { PRIORITY_LABELS } from './priority'
import { getTaskColorSwatch } from './taskColor'

interface TaskCardProps {
  task: Task
  /** Tag id -> name, so cards can show tag names without each doing its own lookup. */
  tagNamesById: ReadonlyMap<string, string>
}

/**
 * Read-only for Phase 1 — displays state (completed, streak, up/down
 * availability, checklist progress) but scoring/editing interactions land
 * in Phase 2. The indicator icons are deliberately non-interactive here, not
 * disabled buttons, so nothing implies functionality that isn't wired up yet.
 */
export function TaskCard({ task, tagNamesById }: TaskCardProps) {
  const swatch = getTaskColorSwatch(task)
  const textRef = useTwemoji<HTMLParagraphElement>([task.text])
  const notesRef = useTwemoji<HTMLDivElement>([task.notes])
  const checklist = 'checklist' in task ? task.checklist : undefined

  return (
    <Card className="flex items-start gap-3 border-l-4 p-3" style={{ borderLeftColor: swatch.accent }}>
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        <Indicator task={task} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          ref={textRef}
          className={cn(
            'text-sm leading-snug',
            'completed' in task && task.completed && 'text-muted-foreground line-through',
          )}
        >
          {task.text}
        </p>

        {task.notes && (
          <div
            ref={notesRef}
            className={cn(
              'prose prose-sm max-w-none text-xs text-muted-foreground',
              'prose-p:my-0.5 prose-headings:my-1 prose-headings:text-foreground',
              'prose-a:text-primary prose-strong:text-foreground prose-li:my-0',
              'dark:prose-invert',
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.notes}</ReactMarkdown>
          </div>
        )}

        {checklist && checklist.length > 0 && (
          <ChecklistPreview items={checklist} />
        )}

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

function ChecklistPreview({ items }: { items: { id: string; text: string; completed: boolean }[] }) {
  const done = items.filter((i) => i.completed).length
  return (
    <div className="mt-0.5 flex flex-col gap-0.5">
      <p className="text-[11px] text-muted-foreground">
        {done}/{items.length} subtasks
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <ChecklistItemRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  )
}

function ChecklistItemRow({ item }: { item: { text: string; completed: boolean } }) {
  const ref = useTwemoji<HTMLSpanElement>([item.text])
  return (
    <li className="flex items-start gap-1.5 text-xs">
      {item.completed ? (
        <CircleCheck className="mt-0.5 size-3 shrink-0 text-primary" />
      ) : (
        <Circle className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      )}
      <span ref={ref} className={cn(item.completed && 'text-muted-foreground line-through')}>
        {item.text}
      </span>
    </li>
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
