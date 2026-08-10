/**
 * Task/Tag/User shapes for the Habitica API v3, matching ../../../docs/habitica-api.md
 * exactly. If a real API response disagrees with this file, fix both together —
 * see CLAUDE.md's conventions section.
 */

export type TaskType = 'habit' | 'daily' | 'todo' | 'reward'
export type TaskAttribute = 'str' | 'int' | 'per' | 'con'
export type TaskPriority = 0.1 | 1 | 1.5 | 2

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  linkId?: string
}

export interface TaskReminder {
  id: string
  startDate?: string
  time: string
}

export interface TaskChallengeInfo {
  shortName?: string
  id?: string
  taskId?: string
  broken?: string
  winner?: string
}

export interface TaskGroupInfo {
  id?: string
  assignedUsers?: string[]
  approval?: { required: boolean; approved: boolean; requested: boolean }
}

interface BaseTask {
  /** `id` and `_id` are the same value; Habitica returns both. */
  id: string
  _id: string
  text: string
  notes: string
  alias?: string
  tags: string[]
  /**
   * "Redness" — Habitica's internal score. Only meaningfully client-settable
   * for rewards (the gold cost); for other types it's server-managed via
   * scoring. See docs/habitica-api.md § Footguns.
   */
  value: number
  priority: TaskPriority
  attribute: TaskAttribute
  challenge: TaskChallengeInfo
  group: TaskGroupInfo
  reminders: TaskReminder[]
  createdAt: string
  updatedAt: string
  byHabitica?: boolean
}

export interface HabitHistoryEntry {
  date: number
  value: number
  scoredUp?: number
  scoredDown?: number
}

export interface HabitTask extends BaseTask {
  type: 'habit'
  up: boolean
  down: boolean
  counterUp: number
  counterDown: number
  frequency: 'daily' | 'weekly' | 'monthly'
  history: HabitHistoryEntry[]
}

export interface DailyRepeat {
  m: boolean
  t: boolean
  w: boolean
  th: boolean
  f: boolean
  s: boolean
  su: boolean
}

export interface DailyHistoryEntry {
  date: number
  value: number
}

export interface DailyTask extends BaseTask {
  type: 'daily'
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  everyX: number
  startDate: string
  /** Only meaningful when frequency is "weekly". */
  repeat: DailyRepeat
  streak: number
  daysOfMonth: number[]
  weeksOfMonth: number[]
  isDue?: boolean
  nextDue?: string[]
  yesterDaily: boolean
  completed: boolean
  collapseChecklist: boolean
  checklist: ChecklistItem[]
  history: DailyHistoryEntry[]
}

export interface TodoTask extends BaseTask {
  type: 'todo'
  /** Due date, optional. */
  date?: string
  dateCompleted?: string
  completed: boolean
  collapseChecklist: boolean
  checklist: ChecklistItem[]
}

export interface RewardTask extends BaseTask {
  type: 'reward'
}

export type Task = HabitTask | DailyTask | TodoTask | RewardTask

export interface Tag {
  id: string
  name: string
  /** Only present on tags auto-created for challenge/group participation. */
  challenge?: boolean
  group?: string
}

export interface UserStats {
  hp: number
  mp: number
  exp: number
  gp: number
  lvl: number
  class: string
  points: number
  str: number
  con: number
  int: number
  per: number
}

export interface UserPreferences {
  /** Hour (0-23) the daily reset happens for this user. */
  dayStart: number
  timezoneOffset: number
  [key: string]: unknown
}

export interface UserProfile {
  name: string
  blurb?: string
  imageUrl?: string
}

export interface HabiticaUser {
  _id: string
  profile: UserProfile
  stats: UserStats
  preferences: UserPreferences
  tags: Tag[]
}

export interface HabiticaEnvelope<T> {
  success: boolean
  data: T
  notifications?: unknown[]
}

export interface HabiticaErrorBody {
  success: false
  error: string
  message: string
  errors?: { message: string; path?: string }[]
}

/** Response of POST /tasks/:id/score/:direction — the user's updated stats, NOT the task. */
export interface ScoreTaskResult extends UserStats {
  delta: number
  _tmp: Record<string, unknown>
}
