import type { Task } from '@/lib/habitica/types'

export type SearchMatchTier = 'title' | 'checklist' | 'notes'

const TIER_ORDER: Record<SearchMatchTier, number> = { title: 0, checklist: 1, notes: 2 }

function includesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query)
}

/**
 * The highest-priority reason `task` matches `query`, or null if it
 * doesn't match at all. Checked in priority order (title, then checklist,
 * then notes) and returns on the first hit — a task matching in both
 * title and notes reports 'title', not 'notes', since that's the tier it
 * sorts by.
 */
export function matchTier(task: Task, query: string): SearchMatchTier | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  if (includesQuery(task.text, q)) return 'title'
  const checklist = 'checklist' in task ? task.checklist : undefined
  if (checklist?.some((item) => includesQuery(item.text, q))) return 'checklist'
  if (includesQuery(task.notes, q)) return 'notes'
  return null
}

/**
 * Filters `tasks` down to those matching `query` (case-insensitive
 * substring against title, any checklist item's text, or notes), sorted
 * title-matches first, then checklist-matches, then notes-only matches.
 * Ties within a tier keep their original relative order — `Array.sort` is
 * stable per spec (ES2019+), and Node/browsers implementing it have been
 * stable for years, so no secondary sort key is needed to make this
 * deterministic.
 *
 * An empty/whitespace-only query returns `tasks` completely unchanged (not
 * even a copy) — no filtering, no reordering — so the task list's normal
 * order is undisturbed when search isn't active.
 */
export function searchTasks(tasks: Task[], query: string): Task[] {
  if (!query.trim()) return tasks

  const matched = tasks
    .map((task) => ({ task, tier: matchTier(task, query) }))
    .filter((entry): entry is { task: Task; tier: SearchMatchTier } => entry.tier !== null)

  matched.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])

  return matched.map((entry) => entry.task)
}
