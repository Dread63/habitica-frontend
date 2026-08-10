import type { Task } from '@/lib/habitica/types'

export type TaskColorName = 'worst' | 'worse' | 'bad' | 'neutral' | 'good' | 'better' | 'best' | 'purple'

/**
 * Ported from Habitica's own client — `getTaskColor()` in
 * website/client/src/store/getters/tasks.js, vendored verbatim at
 * docs/vendor/task-color.getter.js. This is *the* mechanic Habitica uses to
 * show a habit/daily aging or being neglected: `value` drifts down with
 * negative scoring / time, up with positive scoring, and the color band it
 * falls into is the primary at-a-glance signal — see docs/habitica-api.md's
 * note on `value` ("redness").
 */
export function getTaskColorName(task: Task): TaskColorName {
  if (task.type === 'reward' || task.byHabitica) return 'purple'

  const { value } = task
  if (value < -20) return 'worst'
  if (value < -10) return 'worse'
  if (value < -1) return 'bad'
  if (value < 1) return 'neutral'
  if (value < 5) return 'good'
  if (value < 10) return 'better'
  return 'best'
}

interface TaskColorSwatch {
  /** The saturated accent Habitica uses as the task control's background. */
  accent: string
  /** The darker, readable-on-accent color Habitica pairs with it for text/icons. */
  onAccent: string
}

/**
 * Hex values are Habitica's own — pulled from docs/vendor/task-colors.scss
 * ($maroon-100/$red-1, $red-100/$red-1, $orange-100/$orange-1, etc.) via the
 * mapping in docs/vendor/task-style.scss (`.task-worst`, `.task-worse`, …).
 * Not approximated from a screenshot or a third-party theme.
 */
export const TASK_COLOR_SWATCHES: Record<TaskColorName, TaskColorSwatch> = {
  worst: { accent: '#DE3F3F', onAccent: '#6C0406' },
  worse: { accent: '#FF6165', onAccent: '#6C0406' },
  bad: { accent: '#FF944C', onAccent: '#7F3300' },
  neutral: { accent: '#FFBE5D', onAccent: '#794B00' },
  good: { accent: '#24CC8F', onAccent: '#005737' },
  better: { accent: '#3BCAD7', onAccent: '#005158' },
  best: { accent: '#50B5E9', onAccent: '#033F5E' },
  purple: { accent: '#925CF3', onAccent: '#FFFFFF' },
}

export function getTaskColorSwatch(task: Task): TaskColorSwatch {
  return TASK_COLOR_SWATCHES[getTaskColorName(task)]
}
