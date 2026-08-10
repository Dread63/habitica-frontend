import { cn } from '@/lib/utils'
import type { TagBucket } from './tagFilter'

/**
 * Green/blue/red for OR/AND/exclude is this app's own convention, not
 * Habitica's (they have no equivalent feature) — chosen for a reasonably
 * standard "add / require / remove" association, not pulled from anywhere.
 */
const BUCKET_CLASSES: Record<TagBucket | 'neutral', string> = {
  neutral: 'border border-border bg-transparent text-muted-foreground hover:bg-muted',
  anyOf:
    'border border-transparent bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600',
  allOf:
    'border border-transparent bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
  noneOf:
    'border border-transparent bg-red-600 text-white line-through hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
}

const BUCKET_DESCRIPTION: Record<TagBucket | 'neutral', string> = {
  neutral: 'not filtered',
  anyOf: 'matches ANY (OR)',
  allOf: 'requires ALL (AND)',
  noneOf: 'excluded',
}

interface TagChipProps {
  name: string
  bucket: TagBucket | 'neutral'
  onClick: () => void
}

export function TagChip({ name, bucket, onClick }: TagChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={bucket !== 'neutral'}
      title={`${name} — ${BUCKET_DESCRIPTION[bucket]}. Click to cycle.`}
      className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-colors', BUCKET_CLASSES[bucket])}
    >
      {name}
    </button>
  )
}
