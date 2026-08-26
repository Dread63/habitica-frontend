import { today, toDateOnlyString } from '@/lib/dateOnly'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { useTags } from '@/features/tasks/useTags'
import {
  aggregateByCategory,
  formatFocusMinutes,
  LIVE_SESSION_ID,
  sessionsOnDate,
  sessionTasksLabel,
  topTasks,
  totalFocusMinutes,
  untrackedMinutes,
} from './pomodoroStats'
import { categoryFill } from './pomodoroCategories'
import { usePomodoroStore } from './pomodoroStore'
import { useLiveFocusSession } from './useLiveFocusSession'

/**
 * All-time totals. The per-day view — trend columns, tiles, top tasks —
 * lives under the timeline in PomodoroDayStats; this tab is the archive.
 * Category bars use the same palette and the same "counts toward every
 * tracked tag" rule, so a task with two tracked tags shows up in both bars
 * and the totals can exceed the elapsed figure above them; the untracked row
 * is the honest remainder.
 */
export function PomodoroStatsPanel() {
  const logged = usePomodoroStore((s) => s.history)
  const trackedTagIds = usePomodoroStore((s) => s.settings.trackedTagIds)
  const tagsQuery = useTags()

  // The focus phase in flight counts here too, so this tab and the timeline
  // page never disagree about how much focus today has seen. The session
  // count stays on committed sessions only — an unfinished one isn't a
  // session yet.
  const live = useLiveFocusSession()
  const history = live ? [...logged, live] : logged

  const recentRef = useTwemoji<HTMLUListElement>([history.length])
  const todayFocus = totalFocusMinutes(sessionsOnDate(history, toDateOnlyString(today())))
  const allTimeFocus = totalFocusMinutes(history)
  const byCategory = aggregateByCategory(history, trackedTagIds)
  const untracked = untrackedMinutes(history, trackedTagIds)
  const tagNamesById = new Map((tagsQuery.data ?? []).map((t) => [t.id, t.name]))

  const categories = Object.entries(byCategory)
    .map(([tagId, minutes]) => ({ tagId, minutes, name: tagNamesById.get(tagId) ?? '(deleted tag)' }))
    .sort((a, b) => b.minutes - a.minutes)
  const scale = Math.max(allTimeFocus, ...categories.map((c) => c.minutes), 1)
  const tasks = topTasks(history, 8)
  const tasksRef = useTwemoji<HTMLUListElement>([tasks.map((t) => t.text).join('|')])

  if (logged.length === 0 && live === null) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No focus sessions yet — start one from the Timer tab, or hover a timeline block and hit the timer icon.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{formatFocusMinutes(todayFocus)}</p>
          <p className="text-xs text-muted-foreground">Focus today</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{formatFocusMinutes(allTimeFocus)}</p>
          <p className="text-xs text-muted-foreground">Focus all-time</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xl font-semibold">{logged.length}</p>
          <p className="text-xs text-muted-foreground">Sessions</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">By category (tracked tags)</span>
        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing categorized yet — pick which tags count as categories in Settings, then focus on tasks
            carrying them. Category totals update retroactively when you change the tracked set.
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
                      width: `${(c.minutes / scale) * 100}%`,
                      backgroundColor: categoryFill(c.tagId, trackedTagIds),
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {formatFocusMinutes(c.minutes)}
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
                <span className="w-28 shrink-0 truncate">Untracked</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full opacity-50"
                    style={{
                      width: `${(untracked / scale) * 100}%`,
                      backgroundColor: categoryFill(null, trackedTagIds),
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums">{formatFocusMinutes(untracked)}</span>
              </li>
            )}
          </ul>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-xs font-medium text-muted-foreground">Most-focused tasks</span>
          <ul ref={tasksRef} className="flex flex-col gap-1">
            {tasks.map((t) => (
              <li key={t.taskId ?? 'uncategorized'} className="flex items-center gap-2 text-xs">
                <span className={cn('min-w-0 flex-1 truncate', t.taskId === null && 'text-muted-foreground italic')}>
                  {emojify(t.text)}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{formatFocusMinutes(t.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">Recent sessions</span>
        <ul ref={recentRef} className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {[...history]
            .reverse()
            .slice(0, 20)
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {emojify(sessionTasksLabel(s))}
                  {s.id === LIVE_SESSION_ID
                    ? ' · in progress'
                    : !s.completedNaturally && ' · stopped early'}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
                  {formatFocusMinutes(s.durationMinutes)}
                </span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}
