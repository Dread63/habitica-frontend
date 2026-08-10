import * as React from 'react'
import { Settings, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type DialogHandle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useTags } from '@/features/tasks/useTags'
import { isTagFilterEmpty, stateOf } from './tagFilter'
import { useTagFilterStore } from './tagFilterStore'
import { TagChip } from './TagChip'
import { TagManagerDialog } from './TagManagerDialog'

export function TagFilterSidebar() {
  const tagsQuery = useTags()
  const filter = useTagFilterStore((s) => s.filter)
  const cycleTag = useTagFilterStore((s) => s.cycleTag)
  const setMode = useTagFilterStore((s) => s.setMode)
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

  const tags = tagsQuery.data ?? []

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

      {tags.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <TagChip key={tag.id} name={tag.name} state={stateOf(filter, tag.id)} onClick={() => cycleTag(tag.id)} />
            ))}
          </div>

          {/* One explicit control for how included tags combine — deliberately
              separate from tag color, so it's never ambiguous the way per-tag
              any/all colors were (see tagFilter.ts's module comment). */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('any')}
              aria-pressed={filter.mode === 'any'}
              className={cn(
                'flex-1 rounded px-2 py-1 font-medium transition-colors',
                filter.mode === 'any' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Match any
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              aria-pressed={filter.mode === 'all'}
              className={cn(
                'flex-1 rounded px-2 py-1 font-medium transition-colors',
                filter.mode === 'all' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Match all
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Click a tag to include it (highlighted), click again to exclude it (red). "Match
            any/all" decides how included tags combine — it only changes anything once you've
            included more than one.
          </p>
        </>
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

      <TagManagerDialog ref={managerRef} />
    </aside>
  )
}
