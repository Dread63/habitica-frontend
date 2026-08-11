import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TagState } from './tagFilter'

const STATE_CLASSES: Record<TagState, string> = {
  neutral: 'border border-border bg-transparent text-muted-foreground hover:bg-muted',
  included: 'border border-transparent bg-primary text-primary-foreground',
  excluded: 'border border-transparent bg-destructive text-destructive-foreground line-through',
}

const STATE_DESCRIPTION: Record<TagState, string> = {
  neutral: 'not filtered',
  included: 'included in filter',
  excluded: 'excluded',
}

interface TagChipProps {
  name: string
  state: TagState
  /** The chip body's own click — a plain include on/off toggle. */
  onToggleIncluded: () => void
  /** The small secondary control — sets/unsets exclusion, independent of the toggle above. */
  onToggleExcluded: () => void
}

/**
 * Two separate controls sharing one pill, not one button cycling through
 * three states (see tagFilter.ts's module comment for why that changed):
 * the chip body is a plain include toggle — the common case, one click
 * either way — and a small corner button handles the rarer, deliberate
 * "exclude this tag" action.
 */
export function TagChip({ name, state, onToggleIncluded, onToggleExcluded }: TagChipProps) {
  return (
    <span className={cn('group inline-flex items-center rounded-full transition-colors', STATE_CLASSES[state])}>
      <button
        type="button"
        onClick={onToggleIncluded}
        aria-pressed={state === 'included'}
        title={`${name} — ${STATE_DESCRIPTION[state]}. Click to ${state === 'included' ? 'remove' : 'include'}.`}
        className="rounded-l-full py-1 pr-1 pl-2.5 text-xs font-medium transition-transform active:scale-95"
      >
        {name}
      </button>
      <button
        type="button"
        onClick={onToggleExcluded}
        aria-pressed={state === 'excluded'}
        aria-label={state === 'excluded' ? `Stop excluding ${name}` : `Exclude ${name}`}
        title={state === 'excluded' ? `Stop excluding ${name}` : `Exclude ${name}`}
        className={cn(
          'rounded-r-full py-1 pr-2 pl-1 opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-70',
          state === 'excluded' && 'opacity-100',
        )}
      >
        <Ban className="size-3" />
      </button>
    </span>
  )
}
