import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Tag } from '@/lib/habitica/types'
import { useTags } from './useTags'
import { useCreateTag } from '@/features/tags/tagMutations'
import { useCreateTask } from './taskMutations'
import { parseQuickAdd } from './quickAdd'
import { PRIORITY_LABELS } from './priority'
import { TASK_TYPE_META } from './taskType'

/**
 * Resolves typed tag names to IDs, creating any that don't exist yet.
 * Sequential (not Promise.all) so a duplicate #tag mentioned twice in one
 * input reuses the tag it just created instead of racing two create calls
 * for the same name.
 */
async function resolveTagIds(
  tagNames: string[],
  existingTags: Tag[],
  createTag: (name: string) => Promise<Tag>,
): Promise<string[]> {
  const byLowerName = new Map(existingTags.map((t) => [t.name.toLowerCase(), t.id]))
  const ids: string[] = []
  for (const rawName of tagNames) {
    const key = rawName.toLowerCase()
    let id = byLowerName.get(key)
    if (id === undefined) {
      const created = await createTag(rawName)
      id = created.id
      byLowerName.set(key, id)
    }
    ids.push(id)
  }
  return ids
}

export function QuickAddBar() {
  const [value, setValue] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const tagsQuery = useTags()
  const createTag = useCreateTag()
  const createTask = useCreateTask()
  const queryClient = useQueryClient()

  const parsed = React.useMemo(() => parseQuickAdd(value), [value])
  const typeMeta = TASK_TYPE_META[parsed.type]
  const TypeIcon = typeMeta.icon

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!parsed.text) return
    setError(null)
    setIsSubmitting(true)
    try {
      // Tags may have just been created above (queryClient reads the latest
      // cache, not a stale closure) — re-read fresh each submit.
      const currentTags = queryClient.getQueryData<Tag[]>(['tags']) ?? tagsQuery.data ?? []
      const tagIds = await resolveTagIds(parsed.tagNames, currentTags, (name) => createTag.mutateAsync(name))
      await createTask.mutateAsync({
        text: parsed.text,
        type: parsed.type,
        priority: parsed.priority,
        tags: tagIds,
      })
      setValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create task.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={'Add a task… #tag or #"multi word tag"  /habit /daily /reward  ! medium  !! hard  ~ trivial'}
          disabled={isSubmitting}
          aria-label="Quick add task"
          className="flex-1"
        />
      </div>

      {value.trim() && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium" style={{ color: typeMeta.accent }}>
            <TypeIcon className="size-3" aria-hidden="true" />
            {typeMeta.label}
          </span>
          <span aria-hidden="true">·</span>
          <span>{PRIORITY_LABELS[parsed.priority]}</span>
          {parsed.tagNames.map((name) => (
            <span key={name} className="rounded-full bg-muted px-1.5 py-0.5">
              #{name}
            </span>
          ))}
          {!parsed.text && <span className="text-destructive">Type a title, not just tokens</span>}
        </div>
      )}

      {error && (
        <p role="alert" className="pl-6 text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
