import * as React from 'react'
import { today, toDateOnlyString } from '@/lib/dateOnly'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { useNowTick } from '@/lib/useNowTick'
import { useTags } from '@/features/tasks/useTags'
import {
  aggregateByCategory,
  formatDuration,
  topTasks,
  totalTrackedMs,
  untrackedCategoryMs,
} from '@/features/tracking/trackingStats'
import {
  entriesOverlappingDay,
  entryDurationMs,
  isOpen,
  wasEdited,
  type TimeEntry,
} from '@/features/tracking/timeEntries'
import { TimeEntryEditor } from '@/features/tracking/TimeEntryEditor'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { categoryFill } from './pomodoroCategories'
import { completedPomodoros } from './pomodoroPhases'
import { usePomodoroStore } from './pomodoroStore'

const RECENT_LIMIT = 25

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * All-time totals and the raw ledger. The per-day view — trend columns,
 * tiles — lives under the timeline in PomodoroDayStats; this tab is the
 * archive, and the "Recent intervals" list is where individual records become
 * visible and, later, editable.
 */
export function PomodoroStatsPanel() {
  const entries = useTimeEntryStore((s) => s.entries)
  const phases = usePomodoroStore((s) => s.phases)
  const trackedTagIds = usePomodoroStore((s) => s.settings.trackedTagIds)
  const tagsQuery = useTags()
  useNowTick(15_000)
  const now = new Date()

  const todayMs = totalTrackedMs(entriesOverlappingDay(entries, toDateOnlyString(today()), now), now)
  const allTimeMs = totalTrackedMs(entries, now)
  const untracked = untrackedCategoryMs(entries, trackedTagIds, now)
  const tagNamesById = new Map((tagsQuery.data ?? []).map((t) => [t.id, t.name]))

  const categories = Object.entries(aggregateByCategory(entries, trackedTagIds, now))
    .map(([tagId, ms]) => ({ tagId, ms, name: tagNamesById.get(tagId) ?? '(deleted tag)' }))
    .sort((a, b) => b.ms - a.ms)
  const scale = Math.max(allTimeMs, ...categories.map((c) => c.ms), 1)
  const tasks = topTasks(entries, 8, now)
  const tasksRef = useTwemoji<HTMLUListElement>([tasks.map((t) => t.text).join('|')])

  const recent = [...entries].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, RECENT_LIMIT)
  const recentRef = useTwemoji<HTMLUListElement>([recent.length])
  const [editing, setEditing] = React.useState<TimeEntry | null>(null)
  // Re-read from the store so an edit made in the dialog is reflected
  // immediately rather than showing the copy captured at click time.
  const editingEntry = editing ? (entries.find((e) => e.id === editing.id) ?? null) : null

  if (entries.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Nothing tracked yet. Start a focus session from the Timer tab, or hit the timer icon on any timeline
        block — time is recorded from the moment you start, not reconstructed afterwards.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{formatDuration(todayMs)}</p>
          <p className="text-xs text-muted-foreground">Tracked today</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{formatDuration(allTimeMs)}</p>
          <p className="text-xs text-muted-foreground">Tracked all-time</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{completedPomodoros(phases).length}</p>
          <p className="text-xs text-muted-foreground">Pomodoros</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">By category (tracked tags)</span>
        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing categorised yet — pick which tags count as categories in Settings, then track time against
            tasks carrying them. Totals update retroactively when you change the tracked set.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {categories.map((c) => (
              <li key={c.tagId} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryFill(c.tagId, trackedTagIds) }}
                />
                <span className="w-28 shrink-0 truncate" title={c.name}>
                  {c.name}
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(c.ms / scale) * 100}%`,
                      backgroundColor: categoryFill(c.tagId, trackedTagIds),
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {formatDuration(c.ms)}
                </span>
              </li>
            ))}
            {untracked > 0 && (
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full opacity-50"
                  style={{ backgroundColor: categoryFill(null, trackedTagIds) }}
                />
                <span className="w-28 shrink-0 truncate">Uncategorised</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full opacity-50"
                    style={{
                      width: `${(untracked / scale) * 100}%`,
                      backgroundColor: categoryFill(null, trackedTagIds),
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums">{formatDuration(untracked)}</span>
              </li>
            )}
          </ul>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-xs font-medium text-muted-foreground">Most-tracked tasks</span>
          <ul ref={tasksRef} className="flex flex-col gap-1">
            {tasks.map((t) => (
              <li key={t.taskId} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{emojify(t.text)}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{formatDuration(t.ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">Recent intervals</span>
        <ul ref={recentRef} className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {recent.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setEditing(entry)}
                title="Edit this interval"
                className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-muted"
              >
              <span className="min-w-0 flex-1 truncate">
                {emojify(entry.taskSnapshot.text)}
                {/* Provenance markers: an interval whose end was reconstructed
                    by the idle prompt is a different claim from one you typed,
                    and both differ from one recorded live. */}
                {wasEdited(entry) && <span className="ml-1 text-muted-foreground/70">· edited</span>}
                {entry.closedBy === 'reconciled' && (
                  <span className="ml-1 text-muted-foreground/70">· end estimated</span>
                )}
              </span>
              <span className={cn('shrink-0 tabular-nums text-muted-foreground', isOpen(entry) && 'text-primary')}>
                {timeOfDay(entry.startedAt)}–{entry.endedAt ? timeOfDay(entry.endedAt) : 'now'} ·{' '}
                {formatDuration(entryDurationMs(entry, now))}
              </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground/70">
          Click an interval to correct it. Edits keep the original values, and the export reports both — a
          corrected log is still honest about what was recorded live.
        </p>
      </div>

      {editingEntry && <TimeEntryEditor entry={editingEntry} onClose={() => setEditing(null)} />}
    </div>
  )
}
