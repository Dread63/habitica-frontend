import { Repeat, CalendarCheck, ListChecks, Gift, type LucideIcon } from 'lucide-react'
import type { TaskType } from '@/lib/habitica/types'

export interface TaskTypeMeta {
  icon: LucideIcon
  /**
   * A quiet per-column identity color — deliberately a *different* system
   * from taskColor.ts's per-task "value" aging scale (the left-border
   * accent on every card), which this leaves untouched. This one only ever
   * shows up in column headers, the quick-add live preview, and the editor
   * dialog's title — never on the card body itself — so the two color
   * systems are never adjacent and can't read as conflicting signals about
   * the same task.
   */
  accent: string
  label: string
}

/**
 * Colors chosen deliberately, not arbitrarily:
 *  - todo reuses the app's own --primary teal, since quick-add already
 *    treats todo as the default type (quickAdd.ts) and it's the "default,
 *    central" list — reusing the app's one existing accent says that.
 *  - reward is purple, matching taskColor.ts's existing (Habitica-sourced)
 *    convention that reward cards are always purple regardless of value.
 *  - habit (indigo) and daily (sky) round out four hues that read as
 *    distinct from each other at a glance.
 */
export const TASK_TYPE_META: Record<TaskType, TaskTypeMeta> = {
  habit: { icon: Repeat, accent: '#6C7BF0', label: 'Habit' },
  daily: { icon: CalendarCheck, accent: '#3AA0E8', label: 'Daily' },
  todo: { icon: ListChecks, accent: 'var(--primary)', label: 'To-Do' },
  reward: { icon: Gift, accent: '#A768F2', label: 'Reward' },
}
