import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Circle, CircleCheck, ChevronUp, ChevronDown, Coins, Flame, Pencil, Trash2, Plus, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type DialogHandle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useTwemoji } from '@/lib/useTwemoji'
import type { Task } from '@/lib/habitica/types'
import { PRIORITY_LABELS } from './priority'
import { getTaskColorSwatch } from './taskColor'
import { TaskEditorDialog } from './TaskEditorDialog'
import {
  useAddChecklistItem,
  useDeleteChecklistItem,
  useDeleteTask,
  useScoreChecklistItem,
  useScoreTask,
} from './taskMutations'

interface TaskCardProps {
  task: Task
  /** Tag id -> name, so cards can show tag names without each doing its own lookup. */
  tagNamesById: ReadonlyMap<string, string>
}

export function TaskCard({ task, tagNamesById }: TaskCardProps) {
  const swatch = getTaskColorSwatch(task)
  const textRef = useTwemoji<HTMLParagraphElement>([task.text])
  const notesRef = useTwemoji<HTMLDivElement>([task.notes])
  const checklist = 'checklist' in task ? task.checklist : undefined

  const scoreTask = useScoreTask()
  const deleteTask = useDeleteTask()
  const editDialogRef = React.useRef<DialogHandle>(null)

  function handleDelete() {
    if (window.confirm(`Delete "${task.text}"? This can't be undone.`)) {
      deleteTask.mutate(task.id)
    }
  }

  return (
    <Card className="flex items-start gap-3 border-l-4 p-3" style={{ borderLeftColor: swatch.accent }}>
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        <Indicator
          task={task}
          isScoring={scoreTask.isPending}
          onScore={(direction) => scoreTask.mutate({ taskId: task.id, direction })}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p
            ref={textRef}
            className={cn(
              'text-sm leading-snug',
              'completed' in task && task.completed && 'text-muted-foreground line-through',
            )}
          >
            {task.text}
          </p>
          <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={`Edit ${task.text}`}
              onClick={() => editDialogRef.current?.open()}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={`Delete ${task.text}`}
              disabled={deleteTask.isPending}
              onClick={handleDelete}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>

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

        {checklist !== undefined && <ChecklistSection taskId={task.id} items={checklist} />}

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

      <TaskEditorDialog ref={editDialogRef} mode="edit" task={task} />
    </Card>
  )
}

function ChecklistSection({
  taskId,
  items,
}: {
  taskId: string
  items: { id: string; text: string; completed: boolean }[]
}) {
  const scoreItem = useScoreChecklistItem()
  const deleteItem = useDeleteChecklistItem()
  const addItem = useAddChecklistItem()
  const [isAdding, setIsAdding] = React.useState(false)
  const [newText, setNewText] = React.useState('')

  const done = items.filter((i) => i.completed).length

  function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    const text = newText.trim()
    if (!text) return
    addItem.mutate(
      { taskId, text },
      {
        onSuccess: () => {
          setNewText('')
          setIsAdding(false)
        },
      },
    )
  }

  return (
    <div className="mt-0.5 flex flex-col gap-0.5">
      {items.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {done}/{items.length} subtasks
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            onToggle={() => scoreItem.mutate({ taskId, itemId: item.id })}
            onDelete={() => deleteItem.mutate({ taskId, itemId: item.id })}
            disabled={scoreItem.isPending || deleteItem.isPending}
          />
        ))}
      </ul>

      {isAdding ? (
        <form onSubmit={handleAdd} className="mt-0.5 flex items-center gap-1">
          <Input
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onBlur={() => {
              if (!newText.trim()) setIsAdding(false)
            }}
            placeholder="Subtask text"
            className="h-6 text-xs"
          />
          <Button type="submit" size="icon" className="h-6 w-6" disabled={addItem.isPending} aria-label="Add subtask">
            <Plus className="size-3" />
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="mt-0.5 flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" /> Add subtask
        </button>
      )}
    </div>
  )
}

function ChecklistItemRow({
  item,
  onToggle,
  onDelete,
  disabled,
}: {
  item: { text: string; completed: boolean }
  onToggle: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const ref = useTwemoji<HTMLSpanElement>([item.text])
  return (
    <li className="group flex items-start gap-1.5 text-xs">
      <button type="button" onClick={onToggle} disabled={disabled} className="mt-0.5 shrink-0">
        {item.completed ? (
          <CircleCheck className="size-3 text-primary" />
        ) : (
          <Circle className="size-3 text-muted-foreground" />
        )}
      </button>
      <span ref={ref} className={cn('flex-1', item.completed && 'text-muted-foreground line-through')}>
        {item.text}
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label="Delete subtask"
        className="shrink-0 opacity-0 group-hover:opacity-100"
      >
        <X className="size-3 text-muted-foreground hover:text-destructive" />
      </button>
    </li>
  )
}

function Indicator({
  task,
  onScore,
  isScoring,
}: {
  task: Task
  onScore: (direction: 'up' | 'down') => void
  isScoring: boolean
}) {
  if (task.type === 'habit') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          disabled={!task.up || isScoring}
          onClick={() => onScore('up')}
          aria-label="Score up"
          className="disabled:opacity-25"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={!task.down || isScoring}
          onClick={() => onScore('down')}
          aria-label="Score down"
          className="disabled:opacity-25"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    )
  }
  if (task.type === 'reward') {
    return (
      <button type="button" disabled={isScoring} onClick={() => onScore('up')} aria-label={`Buy ${task.text}`}>
        <Coins className="size-4" />
      </button>
    )
  }
  // daily / todo
  return (
    <button
      type="button"
      disabled={isScoring}
      onClick={() => onScore(task.completed ? 'down' : 'up')}
      aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
    >
      {task.completed ? <CircleCheck className="size-4 text-primary" /> : <Circle className="size-4" />}
    </button>
  )
}
