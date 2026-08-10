import * as React from 'react'
import { Settings, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type DialogHandle } from '@/components/ui/dialog'
import { useTags } from '@/features/tasks/useTags'
import { bucketOf, isTagFilterEmpty } from './tagFilter'
import { useTagFilterStore } from './tagFilterStore'
import { TagChip } from './TagChip'
import { TagManagerDialog } from './TagManagerDialog'

export function TagFilterSidebar() {
  const tagsQuery = useTags()
  const filter = useTagFilterStore((s) => s.filter)
  const cycleTag = useTagFilterStore((s) => s.cycleTag)
  const clearFilter = useTagFilterStore((s) => s.clearFilter)
  const presets = useTagFilterStore((s) => s.presets)
  const savePreset = useTagFilterStore((s) => s.savePreset)
  const applyPreset = useTagFilterStore((s) => s.applyPreset)
  const deletePreset = useTagFilterStore((s) => s.deletePreset)
  const managerRef = React.useRef<DialogHandle>(null)

  function handleSavePreset() {
    // window.prompt is a deliberate placeholder — see TagManagerDialog's note.
    const name = window.prompt('Name this filter:')
    if (name && name.trim()) savePreset(name.trim())
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 sm:w-56">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="Manage tags"
          onClick={() => managerRef.current?.open()}
        >
          <Settings className="size-3.5" />
        </Button>
      </div>

      {tagsQuery.data && tagsQuery.data.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tagsQuery.data.map((tag) => (
            <TagChip key={tag.id} name={tag.name} bucket={bucketOf(filter, tag.id)} onClick={() => cycleTag(tag.id)} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No tags yet — add one from Manage tags.</p>
      )}

      {!isTagFilterEmpty(filter) && (
        <Button type="button" variant="outline" size="sm" onClick={clearFilter} className="self-start">
          <X className="size-3" /> Clear filter
        </Button>
      )}

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved filters</h3>
          {!isTagFilterEmpty(filter) && (
            <button type="button" onClick={handleSavePreset} className="text-xs text-primary hover:underline">
              Save current
            </button>
          )}
        </div>
        {presets.length === 0 && <p className="text-xs text-muted-foreground">None saved yet.</p>}
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => applyPreset(preset.id)}
              className="truncate text-left text-xs hover:underline"
            >
              {preset.name}
            </button>
            <button type="button" onClick={() => deletePreset(preset.id)} aria-label={`Delete ${preset.name}`}>
              <X className="size-3 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Click a tag to cycle: <span className="font-medium text-green-600 dark:text-green-400">green = match any</span>,{' '}
        <span className="font-medium text-blue-600 dark:text-blue-400">blue = require all</span>,{' '}
        <span className="font-medium text-red-600 dark:text-red-400">red = exclude</span>.
      </p>

      <TagManagerDialog ref={managerRef} />
    </aside>
  )
}
