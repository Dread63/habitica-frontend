import * as React from 'react'
import { Circle, CircleCheck, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
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
  const addInputRef = React.useRef<HTMLInputElement>(null)

  const done = items.filter((i) => i.completed).length

  function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    const text = newText.trim()
    if (!text) return
    addItem.mutate(
      { taskId, text },
      {
        // Stays open (rather than closing back to the "Add subtask" link)
        // and refocuses, so entering several subtasks in a row is just
        // "type, Enter, type, Enter…" instead of a click between each one.
        onSuccess: () => {
          setNewText('')
          addInputRef.current?.focus()
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
    <div className="mt-1 flex flex-col gap-1">
      {items.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground">
          {done}/{items.length} subtasks
        </p>
      )}
      <ul className="flex flex-col">
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
        <form onSubmit={handleAdd} className="mt-1 flex items-center gap-1.5">
          <Input
            ref={addInputRef}
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onBlur={() => {
              if (!newText.trim()) setIsAdding(false)
            }}
            placeholder="Subtask text"
            className="h-9 text-sm"
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={addItem.isPending} aria-label="Add subtask">
            <Plus className="size-4" />
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="mt-1 flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" /> Add subtask
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
    // Row-level padding plus a size-7 tick button gives the checkbox a real
    // ~28px hit target — this is the control you tap most while working
    // through a task, and it was previously a bare 12px icon.
    <li className="group -mx-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm transition-colors hover:bg-muted/50">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={item.completed ? `Mark "${item.text}" incomplete` : `Mark "${item.text}" complete`}
        className="flex size-7 shrink-0 items-center justify-center rounded-md transition-transform active:scale-90 disabled:active:scale-100"
      >
        {item.completed ? (
          <CircleCheck className="size-4.5 text-primary" />
        ) : (
          <Circle className="size-4.5 text-muted-foreground" />
        )}
      </button>
      <span
        ref={ref}
        className={cn('flex-1 leading-snug', item.completed && 'text-muted-foreground line-through')}
      >
        {emojify(item.text)}
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label="Delete subtask"
        className="flex size-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-4 text-muted-foreground hover:text-destructive" />
      </button>
    </li>
  )
}
