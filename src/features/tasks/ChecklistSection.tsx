import * as React from 'react'
import { Circle, CircleCheck, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useTwemoji } from '@/lib/useTwemoji'
import { useAddChecklistItem, useDeleteChecklistItem, useScoreChecklistItem } from './taskMutations'

/**
 * Extracted out of TaskCard so the expanded task-detail view (opened via
 * TaskEditorDialog's 'view' mode) can show the same interactive checklist
 * instead of a second, divergent read-only copy.
 */
export function ChecklistSection({
  taskId,
  items,
  summaryOnly = false,
}: {
  taskId: string
  items: { id: string; text: string; completed: boolean }[]
  /** Compact-density TaskCard: show just "X/Y subtasks", not the full list —
   * click through to the detail view (TaskEditorDialog's 'view' mode) for
   * the interactive version. Always false in the detail view itself. */
  summaryOnly?: boolean
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

  if (summaryOnly) {
    return items.length > 0 ? (
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {done}/{items.length} subtasks
      </p>
    ) : null
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
