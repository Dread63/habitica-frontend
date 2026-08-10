import type { TaskPriority } from '@/lib/habitica/types'

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  0.1: 'Trivial',
  1: 'Easy',
  1.5: 'Medium',
  2: 'Hard',
}
