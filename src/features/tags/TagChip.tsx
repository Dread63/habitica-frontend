import { cn } from '@/lib/utils'
import type { TagState } from './tagFilter'

const STATE_CLASSES: Record<TagState, string> = {
  neutral: 'border border-border bg-transparent text-muted-foreground hover:bg-muted',
  included: 'border border-transparent bg-primary text-primary-foreground hover:opacity-90',
  excluded:
    'border border-transparent bg-red-600 text-white line-through hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
}

const STATE_DESCRIPTION: Record<TagState, string> = {
  neutral: 'not filtered',
  included: 'included in filter',
  excluded: 'excluded',
}

interface TagChipProps {
  name: string
  state: TagState
  onClick: () => void
}

export function TagChip({ name, state, onClick }: TagChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state !== 'neutral'}
      title={`${name} — ${STATE_DESCRIPTION[state]}. Click to cycle.`}
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium transition-[color,background-color,transform] active:scale-95',
        STATE_CLASSES[state],
      )}
    >
      {name}
    </button>
  )
}
