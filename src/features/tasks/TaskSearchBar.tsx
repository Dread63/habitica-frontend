import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface TaskSearchBarProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Deliberately a separate control from QuickAddBar, stacked directly below
 * it, rather than overloading one input for both jobs — quick-add's Enter
 * key creates a task, and a search box whose Enter key does something
 * different (or nothing) sitting in the exact same field would be
 * confusing. See taskSearch.ts for the title > checklist > notes ranking
 * this drives.
 */
export function TaskSearchBar({ value, onChange }: TaskSearchBarProps) {
  return (
    <div className="flex items-center gap-2">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="relative flex-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search titles, subtasks, and descriptions…"
          aria-label="Search tasks"
          className="pr-7"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute inset-y-0 right-1.5 flex items-center text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
