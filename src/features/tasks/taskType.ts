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
 *  - todo reuses the app's own --primary (violet, since the Proton-style
 *    reskin — see index.css), since quick-add already treats todo as the
 *    default type (quickAdd.ts) and it's the "default, central" list —
 *    reusing the app's one existing accent says that.
 *  - reward is gold/amber — Habitica's own currency color, and it reads as
 *    "treasure" independent of any other system here. This used to be
 *    purple to match taskColor.ts's reward-is-always-purple convention
 *    (still true there — that's Habitica-sourced data, untouched), but
 *    once --primary itself became violet that would've put two "purple"
 *    signals right next to each other in the rail header (Rewards sits
 *    directly above/below To-Dos) with no way to tell them apart at a
 *    glance — worse than the thing the two-system split was meant to avoid.
 *  - habit (blue) and daily (rose) round out four hues that stay visually
 *    distinct from each other and from primary at a glance.
 */
export const TASK_TYPE_META: Record<TaskType, TaskTypeMeta> = {
  habit: { icon: Repeat, accent: '#4C8DFF', label: 'Habit' },
  daily: { icon: CalendarCheck, accent: '#EC6B9E', label: 'Daily' },
  todo: { icon: ListChecks, accent: 'var(--primary)', label: 'To-Do' },
  reward: { icon: Gift, accent: '#F0A93A', label: 'Reward' },
}
