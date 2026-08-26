import * as React from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Dialog, type DialogHandle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmDialog } from '@/components/ui/confirmStore'
import { promptDialog } from '@/components/ui/promptStore'
import { useTags } from '@/features/tasks/useTags'
import { useCreateTag, useDeleteTag, useRenameTag, useReorderTag } from './tagMutations'

/**
 * Deliberately separate from the filter chips in TagFilterSidebar — chip
 * clicks cycle filter state, so administration (rename/delete/reorder)
 * lives here instead of competing for the same click target.
 */
export const TagManagerDialog = React.forwardRef<DialogHandle>((_props, ref) => {
  const tagsQuery = useTags()
  const createTag = useCreateTag()
  const renameTag = useRenameTag()
  const deleteTag = useDeleteTag()
  const reorderTag = useReorderTag()
  const [newName, setNewName] = React.useState('')
  const dialogRef = React.useRef<DialogHandle>(null)

  React.useImperativeHandle(ref, () => ({
    open: () => dialogRef.current?.open(),
    close: () => dialogRef.current?.close(),
  }))

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    createTag.mutate(name, { onSuccess: () => setNewName('') })
  }

  async function handleRename(tagId: string, currentName: string) {
    const name = await promptDialog({ title: 'Rename tag', label: 'Tag name', defaultValue: currentName, confirmLabel: 'Rename' })
    if (name && name.trim() && name.trim() !== currentName) {
      renameTag.mutate({ tagId, name: name.trim() })
    }
  }

  async function handleDelete(tagId: string, name: string) {
    const confirmed = await confirmDialog({
      title: 'Delete tag?',
      message: `Delete tag "${name}"? It will be removed from every task that has it.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (confirmed) deleteTag.mutate(tagId)
  }

  const tags = tagsQuery.data ?? []

  return (
    <Dialog ref={dialogRef} title="Manage tags">
      <div className="flex flex-col gap-3">
        <form onSubmit={handleCreate} className="flex items-center gap-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New tag name"
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={createTag.isPending}>
            Add
          </Button>
        </form>

        {tags.length === 0 && <p className="text-xs text-muted-foreground">No tags yet.</p>}

        <ul className="flex flex-col gap-1">
          {tags.map((tag, index) => (
            <li
              key={tag.id}
              className="flex items-center justify-between gap-1 rounded-md px-1.5 py-1 hover:bg-muted"
            >
              <button
                type="button"
                onClick={() => handleRename(tag.id, tag.name)}
                className="flex-1 truncate text-left text-sm hover:underline"
              >
                {tag.name}
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Move ${tag.name} up`}
                  disabled={index === 0 || reorderTag.isPending}
                  onClick={() => reorderTag.mutate({ tagId: tag.id, to: index - 1 })}
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Move ${tag.name} down`}
                  disabled={index === tags.length - 1 || reorderTag.isPending}
                  onClick={() => reorderTag.mutate({ tagId: tag.id, to: index + 1 })}
                >
                  <ArrowDown className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Delete ${tag.name}`}
                  disabled={deleteTag.isPending}
                  onClick={() => handleDelete(tag.id, tag.name)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  )
})
TagManagerDialog.displayName = 'TagManagerDialog'
