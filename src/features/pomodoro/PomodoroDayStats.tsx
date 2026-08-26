import * as React from 'react'
import { Flame, Gauge, Target, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { parseDateOnlyString, today, toDateOnlyString } from '@/lib/dateOnly'
import { useTags } from '@/features/tasks/useTags'
import {
  aggregateByCategory,
  dailyFocusSeries,
  formatFocusMinutes,
  sessionsOnDate,
  topTasks,
  totalFocusMinutes,
  untrackedMinutes,
} from './pomodoroStats'
import { categoryFill } from './pomodoroCategories'
import { usePomodoroStore } from './pomodoroStore'
import { useLiveFocusSession } from './useLiveFocusSession'

const TREND_DAYS = 7
const TOP_TASK_LIMIT = 6

function StatTile({
  icon: Icon,
  value,
  label,
  hint,
}: {
  icon: typeof Timer
  value: string
  label: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Icon className="size-7 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        {/* Proportional figures, not tabular: equal-width digits make a
            standalone number at this size read loose. tabular-nums belongs
            on the aligned columns below, and on the ticking countdown. */}
        <p className="text-xl font-semibold">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground/70">{hint}</p>}
      </div>
    </div>
  )
}

/**
 * Focus stats for the day the timeline is showing, in the space beneath the
 * scrubber — the glanceable half of the feature, for when the timeline sits
 * open on a monitor. All-time totals stay in the pomodoro dialog's Stats tab.
 *
 * Three readings, deliberately kept as three separate charts rather than one
 * combined one, because they measure subtly different things and merging
 * them would misstate at least one:
 *
 *  - **Category totals** (horizontal bars) count a task's minutes fully
 *    toward *every* tracked tag it carries, so a task tagged Work and Deep
 *    Work contributes to both. That means these bars can add up to more than
 *    the day's real focus time, which is exactly why they're drawn as
 *    independent bars against the day's total and never stacked into one.
 *  - **The 7-day trend** (stacked columns) has to partition a whole, so it
 *    assigns each slice of time to a single *primary* category (see
 *    dailyFocusSeries). Column height is real minutes.
 *  - **Top tasks** is the raw per-task attribution, no tag math at all.
 *
 * Every category readout carries a visible name and minute count next to its
 * swatch: the palette's light-mode steps sit below 3:1 contrast on white for
 * three of the eight slots, and the documented relief for that is labels
 * rather than re-picking hues (see index.css).
 */
export function PomodoroDayStats({ date }: { date: string }) {
  const history = usePomodoroStore((s) => s.history)
  const trackedTagIds = usePomodoroStore((s) => s.settings.trackedTagIds)
  const tagsQuery = useTags()
  const [hoveredDay, setHoveredDay] = React.useState<string | null>(null)

  const tagNamesById = React.useMemo(
    () => new Map((tagsQuery.data ?? []).map((t) => [t.id, t.name])),
    [tagsQuery.data],
  )
  const nameOf = (tagId: string | null) =>
    tagId === null ? 'Untracked' : (tagNamesById.get(tagId) ?? '(deleted tag)')

  const anchor = parseDateOnlyString(date) ?? today()
  const isToday = date === toDateOnlyString(today())

  // The focus phase in flight, folded in as a provisional session so every
  // reading below moves while you work rather than jumping once per phase.
  // It only belongs to the day it started on, so viewing an earlier day is
  // unaffected.
  const live = useLiveFocusSession()
  const liveOnThisDay = live !== null && sessionsOnDate([live], date).length === 1 ? live : null
  const liveMinutes = liveOnThisDay?.durationMinutes ?? 0

  const loggedSessions = sessionsOnDate(history, date)
  const daySessions = liveOnThisDay ? [...loggedSessions, liveOnThisDay] : loggedSessions
  const allSessions = liveOnThisDay ? [...history, liveOnThisDay] : history

  const focusMinutes = totalFocusMinutes(daySessions)
  // Completed-pomodoro count and the average both describe *finished*
  // sessions, so they deliberately ignore the in-progress one — otherwise
  // starting a session would drag the day's average down as it ran.
  const pomodoros = loggedSessions.filter((s) => s.completedNaturally).length
  const stoppedEarly = loggedSessions.length - pomodoros
  const loggedMinutes = totalFocusMinutes(loggedSessions)
  const avgSession = loggedSessions.length === 0 ? 0 : loggedMinutes / loggedSessions.length

  const untracked = untrackedMinutes(daySessions, trackedTagIds)
  // Clamped: attribution minutes are rounded to 2dp per item, so a long day
  // can drift a hair past the session totals and produce 101% or -1%.
  const trackedShare =
    focusMinutes === 0 ? 0 : Math.min(100, Math.max(0, Math.round(((focusMinutes - untracked) / focusMinutes) * 100)))

  const categories = Object.entries(aggregateByCategory(daySessions, trackedTagIds))
    .map(([tagId, minutes]) => ({ tagId, minutes, name: nameOf(tagId) }))
    .sort((a, b) => b.minutes - a.minutes)
  const categoryScale = Math.max(focusMinutes, ...categories.map((c) => c.minutes), 1)

  const trend = React.useMemo(
    () => dailyFocusSeries(allSessions, TREND_DAYS, anchor, trackedTagIds),
    // anchor is derived from `date`; depending on the Date object itself
    // would rebuild this every render. liveMinutes stands in for the
    // provisional session, which is a fresh object on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, date, trackedTagIds, liveMinutes],
  )
  const trendMax = Math.max(...trend.map((d) => d.totalMinutes), 1)
  const trendTotal = trend.reduce((sum, d) => sum + d.totalMinutes, 0)
  const hoveredTrendDay = trend.find((d) => d.date === hoveredDay)

  const tasks = topTasks(daySessions, TOP_TASK_LIMIT)
  const otherTaskCount = Math.max(0, new Set(daySessions.flatMap((s) => s.attribution.map((a) => a.taskId))).size - tasks.length)
  // Which of those rows the in-progress session is still adding to — shown
  // with a live dot, so a number that's climbing is visibly doing so.
  const liveTaskIds = new Set(liveOnThisDay?.attribution.map((a) => a.taskId) ?? [])
  const tasksRef = useTwemoji<HTMLUListElement>([tasks.map((t) => t.text).join('|')])

  // Legend covers every category that actually appears in the week's
  // columns, in tracked order so colors stay stable across renders.
  const legendTagIds = [
    ...trackedTagIds.filter((tagId) => trend.some((d) => d.slices.some((s) => s.tagId === tagId))),
    ...(trend.some((d) => d.slices.some((s) => s.tagId === null)) ? [null] : []),
  ]

  return (
    <section className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Timer}
          value={formatFocusMinutes(focusMinutes)}
          label={isToday ? 'Focus today' : 'Focus this day'}
          hint={
            liveMinutes > 0
              ? `${formatFocusMinutes(loggedMinutes)} logged · ${formatFocusMinutes(liveMinutes)} in progress`
              : `${formatFocusMinutes(trendTotal)} over ${TREND_DAYS} days`
          }
        />
        <StatTile
          icon={Flame}
          value={String(pomodoros)}
          label="Pomodoros completed"
          hint={stoppedEarly > 0 ? `${stoppedEarly} stopped early` : undefined}
        />
        <StatTile icon={Gauge} value={formatFocusMinutes(avgSession)} label="Average session" />
        <StatTile
          icon={Target}
          value={`${trackedShare}%`}
          label="In a tracked category"
          hint={untracked > 0 ? `${formatFocusMinutes(untracked)} untracked` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Category totals for the viewed day. */}
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">By category</h3>
          {categories.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              {trackedTagIds.length === 0
                ? "No focus categories yet — pick which tags should count as categories in the pomodoro dialog's Settings tab, then focus on tasks carrying them. Totals fill in retroactively."
                : 'No categorized focus this day — the tasks focused on here carry none of your tracked tags.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {categories.map((c) => (
                <li key={c.tagId} className="flex items-center gap-2 text-xs">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryFill(c.tagId, trackedTagIds) }}
                  />
                  <span className="w-24 shrink-0 truncate font-medium" title={c.name}>
                    {c.name}
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(c.minutes / categoryScale) * 100}%`,
                        backgroundColor: categoryFill(c.tagId, trackedTagIds),
                      }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-muted-foreground tabular-nums">
                    {formatFocusMinutes(c.minutes)}
                    {focusMinutes > 0 && ` · ${Math.round((c.minutes / focusMinutes) * 100)}%`}
                  </span>
                </li>
              ))}
              {untracked > 0 && (
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full opacity-50"
                    style={{ backgroundColor: categoryFill(null, trackedTagIds) }}
                  />
                  <span className="w-24 shrink-0 truncate">Untracked</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full opacity-50"
                      style={{
                        width: `${(untracked / categoryScale) * 100}%`,
                        backgroundColor: categoryFill(null, trackedTagIds),
                      }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">{formatFocusMinutes(untracked)}</span>
                </li>
              )}
            </ul>
          )}

          <h3 className="mt-2 border-t border-border pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Where the time went
          </h3>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing logged this day yet. A focus session starts showing up here as soon as it's running.
            </p>
          ) : (
            <ul ref={tasksRef} className="flex flex-col gap-1">
              {tasks.map((t) => (
                <li key={t.taskId ?? 'uncategorized'} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn('min-w-0 flex-1 truncate', t.taskId === null && 'text-muted-foreground italic')}
                  >
                    {emojify(t.text)}
                  </span>
                  {/* A steady dot on rows the running session is still adding
                      to — otherwise a climbing number looks like a glitch. */}
                  {liveTaskIds.has(t.taskId) && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                      title="Still counting — this session is in progress"
                    />
                  )}
                  <span className="shrink-0 text-muted-foreground tabular-nums">{formatFocusMinutes(t.minutes)}</span>
                </li>
              ))}
              {otherTaskCount > 0 && (
                <li className="text-xs text-muted-foreground/70">
                  +{otherTaskCount} more — full list in the pomodoro dialog's Stats tab
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Seven-day trend, ending on the viewed day. */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Last {TREND_DAYS} days
          </h3>
          <div className="relative flex h-40 items-end gap-1.5">
            {trend.map((day) => {
              const dayDate = parseDateOnlyString(day.date)
              const isAnchor = day.date === date
              const heightPct = (day.totalMinutes / trendMax) * 100
              return (
                <div
                  key={day.date}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center gap-1"
                  onMouseEnter={() => setHoveredDay(day.date)}
                  onMouseLeave={() => setHoveredDay(null)}
                  onFocus={() => setHoveredDay(day.date)}
                  onBlur={() => setHoveredDay(null)}
                  tabIndex={0}
                  role="img"
                  aria-label={`${dayDate?.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) ?? day.date}: ${formatFocusMinutes(day.totalMinutes)} of focus`}
                >
                  <span
                    className={cn(
                      'text-[10px] tabular-nums',
                      day.totalMinutes > 0 ? 'text-muted-foreground' : 'text-transparent',
                    )}
                  >
                    {formatFocusMinutes(day.totalMinutes)}
                  </span>
                  {/* The plot band. The bar is absolutely positioned inside
                      it so its percentage height resolves against *this*
                      box — a percentage against the whole column would be
                      measured including the two label rows, and a full-height
                      day would then overflow the card. */}
                  <div className="relative w-full min-h-0 flex-1">
                    {/* Stacked segments, 2px apart so adjacent fills read as
                        separate marks rather than one blended band. */}
                    <div
                      className="absolute inset-x-0 bottom-0 mx-auto flex max-w-10 flex-col-reverse gap-[2px] overflow-hidden rounded-t"
                      style={{ height: `${Math.max(heightPct, day.totalMinutes > 0 ? 2 : 0)}%` }}
                    >
                      {day.slices.map((slice) => (
                        <span
                          key={slice.tagId ?? 'untracked'}
                          // The wrapper's rounded-t + overflow-hidden already
                          // rounds the column's data-end; in flex-col-reverse
                          // the visual top is the *last* child, so per-segment
                          // radii here would land on the wrong end anyway.
                          className={cn('block w-full', slice.tagId === null && 'opacity-50')}
                          style={{
                            height: `${(slice.minutes / day.totalMinutes) * 100}%`,
                            backgroundColor: categoryFill(slice.tagId, trackedTagIds),
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] whitespace-nowrap',
                      isAnchor ? 'font-semibold text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {dayDate?.toLocaleDateString(undefined, { weekday: 'narrow' }) ?? '?'}
                  </span>
                </div>
              )
            })}

            {/* Resolved rather than asserted: changing the viewed day while
                a column is hovered can leave hoveredDay outside the new
                window, and a non-null assertion there would crash. */}
            {hoveredTrendDay && (
              <TrendTooltip day={hoveredTrendDay} nameOf={nameOf} trackedTagIds={trackedTagIds} />
            )}
          </div>

          {legendTagIds.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {legendTagIds.map((tagId) => (
                <li key={tagId ?? 'untracked'} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className={cn('size-2.5 rounded-full', tagId === null && 'opacity-50')}
                    style={{ backgroundColor: categoryFill(tagId, trackedTagIds) }}
                  />
                  {nameOf(tagId)}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground/70">
            Columns are real focus minutes, split by each block's primary category. The bars on the left count every
            tracked tag a task carries, so those can total more than the day itself.
          </p>
        </div>
      </div>
    </section>
  )
}

function TrendTooltip({
  day,
  nameOf,
  trackedTagIds,
}: {
  day: { date: string; totalMinutes: number; sessions: number; slices: { tagId: string | null; minutes: number }[] }
  nameOf: (tagId: string | null) => string
  trackedTagIds: string[]
}) {
  const label = parseDateOnlyString(day.date)?.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  return (
    // Pinned to the top-centre of the plot rather than to the hovered column:
    // seven narrow columns in a half-width card means a column-anchored
    // tooltip would overflow the card at both ends.
    <div className="pointer-events-none absolute top-0 left-1/2 z-20 w-44 -translate-x-1/2 rounded-md border border-border bg-card p-2 text-[11px] shadow-lg">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {formatFocusMinutes(day.totalMinutes)} · {day.sessions} session{day.sessions === 1 ? '' : 's'}
      </p>
      {day.slices.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {day.slices.map((slice) => (
            <li key={slice.tagId ?? 'untracked'} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn('size-2 shrink-0 rounded-full', slice.tagId === null && 'opacity-50')}
                style={{ backgroundColor: categoryFill(slice.tagId, trackedTagIds) }}
              />
              <span className="min-w-0 flex-1 truncate">{nameOf(slice.tagId)}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{formatFocusMinutes(slice.minutes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
