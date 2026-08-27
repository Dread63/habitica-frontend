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
  distinctTaskCount,
  formatDuration,
  topTasks,
  totalTrackedMs,
  untrackedCategoryMs,
} from '@/features/tracking/trackingStats'
import { entriesOverlappingDay, openEntryOf } from '@/features/tracking/timeEntries'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { useNowTick } from '@/lib/useNowTick'
import { comparePlanToActual } from '@/features/tracking/planVsActual'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import { categoryFill } from './pomodoroCategories'
import { completedPomodoros, phaseActualMs, workPhases } from './pomodoroPhases'
import { usePomodoroStore } from './pomodoroStore'

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
 *  - **Top tasks** sums recorded intervals per task, no tag math at all.
 *
 * Every category readout carries a visible name and duration next to its
 * swatch: the palette's light-mode steps sit below 3:1 contrast on white for
 * three of the eight slots, and the documented relief for that is labels
 * rather than re-picking hues (see index.css).
 */
export function PomodoroDayStats({ date }: { date: string }) {
  const entries = useTimeEntryStore((s) => s.entries)
  const phases = usePomodoroStore((s) => s.phases)
  const trackedTagIds = usePomodoroStore((s) => s.settings.trackedTagIds)
  const tagsQuery = useTags()
  const [hoveredDay, setHoveredDay] = React.useState<string | null>(null)
  // An open entry grows in real time; without this the day total would sit
  // frozen until some unrelated state change forced a render.
  useNowTick(15_000)
  const now = new Date()

  const tagNamesById = React.useMemo(
    () => new Map((tagsQuery.data ?? []).map((t) => [t.id, t.name])),
    [tagsQuery.data],
  )
  const nameOf = (tagId: string | null) =>
    tagId === null ? 'Untracked' : (tagNamesById.get(tagId) ?? '(deleted tag)')

  const anchor = parseDateOnlyString(date) ?? today()
  const isToday = date === toDateOnlyString(today())

  const dayEntries = entriesOverlappingDay(entries, date, now)
  const trackedMs = totalTrackedMs(dayEntries, now)
  const isTrackingNow = isToday && openEntryOf(entries) !== undefined

  // Pomodoro counts come from the PHASE log, tracked time from the LEDGER.
  // They are different records answering different questions and will not
  // agree — see the note rendered under the tiles.
  const dayPhases = phases.filter((p) => toDateOnlyString(new Date(p.startedAt)) === date)
  const pomodoros = completedPomodoros(dayPhases).length
  const dayWorkPhases = workPhases(dayPhases)
  const stoppedEarly = dayWorkPhases.length - pomodoros
  const avgPomodoroMs =
    dayWorkPhases.length === 0
      ? 0
      : dayWorkPhases.reduce((sum, p) => sum + phaseActualMs(p), 0) / dayWorkPhases.length

  const untracked = untrackedCategoryMs(dayEntries, trackedTagIds, now)
  const trackedShare =
    trackedMs === 0 ? 0 : Math.min(100, Math.max(0, Math.round(((trackedMs - untracked) / trackedMs) * 100)))

  const categories = Object.entries(aggregateByCategory(dayEntries, trackedTagIds, now))
    .map(([tagId, ms]) => ({ tagId, ms, name: nameOf(tagId) }))
    .sort((a, b) => b.ms - a.ms)
  const categoryScale = Math.max(trackedMs, ...categories.map((c) => c.ms), 1)

  const trend = React.useMemo(
    () => dailyFocusSeries(entries, TREND_DAYS, anchor, trackedTagIds),
    // anchor derives from `date`; depending on the Date object itself would
    // rebuild this every render. trackedMs stands in for the open entry,
    // which grows on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, date, trackedTagIds, trackedMs],
  )
  const trendMax = Math.max(...trend.map((d) => d.totalMs), 1)
  const trendTotal = trend.reduce((sum, d) => sum + d.totalMs, 0)
  const hoveredTrendDay = trend.find((d) => d.date === hoveredDay)

  // Planned vs recorded. Only meaningful now that the two are genuinely
  // separate records — under the old model the plan *was* the evidence.
  const planEntries = useTimelineEntryStore((s) => s.entries)
  const comparison = React.useMemo(
    () => comparePlanToActual(planEntries, entries, date, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planEntries, entries, date, trackedMs],
  )
  const adherence =
    comparison.trackedMs === 0 ? null : Math.round((comparison.adherentMs / comparison.trackedMs) * 100)

  const tasks = topTasks(dayEntries, TOP_TASK_LIMIT, now)
  const otherTaskCount = Math.max(0, distinctTaskCount(dayEntries) - tasks.length)
  const liveTaskId = openEntryOf(entries)?.taskId ?? null
  const tasksRef = useTwemoji<HTMLUListElement>([tasks.map((t) => t.text).join('|')])

  const legendTagIds = [
    ...trackedTagIds.filter((tagId) => trend.some((d) => d.slices.some((s) => s.tagId === tagId))),
    ...(trend.some((d) => d.slices.some((s) => s.tagId === null)) ? [null] : []),
  ]

  return (
    <section className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Timer}
          value={formatDuration(trackedMs)}
          label={isToday ? 'Tracked today' : 'Tracked this day'}
          hint={
            isTrackingNow ? 'still counting' : `${formatDuration(trendTotal)} over ${TREND_DAYS} days`
          }
        />
        <StatTile
          icon={Flame}
          value={String(pomodoros)}
          label="Pomodoros completed"
          hint={stoppedEarly > 0 ? `${stoppedEarly} stopped early` : undefined}
        />
        <StatTile icon={Gauge} value={formatDuration(avgPomodoroMs)} label="Average pomodoro" />
        <StatTile
          icon={Target}
          value={`${trackedShare}%`}
          label="In a tracked category"
          hint={untracked > 0 ? `${formatDuration(untracked)} uncategorised` : undefined}
        />
      </div>

      {/* Without this, "4 pomodoros · 1h 38m tracked" reads as a bug and
          someone eventually "reconciles" the two into one wrong number. */}
      <p className="-mt-1 text-[11px] text-muted-foreground/70">
        Pomodoros count completed timer phases; tracked time is what the pointer actually recorded. They answer
        different questions and will rarely match exactly — time worked past the bell counts, an ignored break
        doesn't.
      </p>

      {comparison.plannedMs > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Planned vs tracked
          </h3>
          <p className="text-sm">
            Planned <span className="font-medium">{formatDuration(comparison.plannedMs)}</span> · tracked{' '}
            <span className="font-medium">{formatDuration(comparison.trackedMs)}</span>
            {adherence !== null && (
              <>
                {' '}
                · <span className="font-medium">{adherence}%</span> of tracked time went to what you'd planned
                for that moment
              </>
            )}
          </p>
          <ul className="flex flex-col gap-1">
            {comparison.rows.slice(0, 5).map((row) => (
              <li key={row.taskId} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{row.text}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  planned {formatDuration(row.plannedMs)} · tracked {formatDuration(row.actualMs)}
                </span>
                <span
                  className={cn(
                    'w-16 shrink-0 text-right tabular-nums',
                    row.deltaMs > 0 ? 'text-primary' : row.deltaMs < 0 ? 'text-muted-foreground' : 'text-muted-foreground/60',
                  )}
                >
                  {row.deltaMs === 0 ? '—' : `${row.deltaMs > 0 ? '+' : '−'}${formatDuration(Math.abs(row.deltaMs))}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                        width: `${(c.ms / categoryScale) * 100}%`,
                        backgroundColor: categoryFill(c.tagId, trackedTagIds),
                      }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-muted-foreground tabular-nums">
                    {formatDuration(c.ms)}
                    {trackedMs > 0 && ` · ${Math.round((c.ms / trackedMs) * 100)}%`}
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
                  <span className="w-24 shrink-0 truncate">Uncategorised</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full opacity-50"
                      style={{
                        width: `${(untracked / categoryScale) * 100}%`,
                        backgroundColor: categoryFill(null, trackedTagIds),
                      }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">{formatDuration(untracked)}</span>
                </li>
              )}
            </ul>
          )}

          <h3 className="mt-2 border-t border-border pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Where the time went
          </h3>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing tracked this day yet. Time appears here the moment you start working on something.
            </p>
          ) : (
            <ul ref={tasksRef} className="flex flex-col gap-1">
              {tasks.map((t) => (
                <li key={t.taskId} className="flex items-center gap-2 text-xs">
                  <span
                    className="min-w-0 flex-1 truncate">
                    {emojify(t.text)}
                  </span>
                  {/* A steady dot on rows the running session is still adding
                      to — otherwise a climbing number looks like a glitch. */}
                  {liveTaskId === t.taskId && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                      title="Still counting — you are working on this now"
                    />
                  )}
                  <span className="shrink-0 text-muted-foreground tabular-nums">{formatDuration(t.ms)}</span>
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
              const heightPct = (day.totalMs / trendMax) * 100
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
                  aria-label={`${dayDate?.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) ?? day.date}: ${formatDuration(day.totalMs)} tracked`}
                >
                  <span
                    className={cn(
                      'text-[10px] tabular-nums',
                      day.totalMs > 0 ? 'text-muted-foreground' : 'text-transparent',
                    )}
                  >
                    {formatDuration(day.totalMs)}
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
                      style={{ height: `${Math.max(heightPct, day.totalMs > 0 ? 2 : 0)}%` }}
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
                            height: `${(slice.ms / day.totalMs) * 100}%`,
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
            Columns are real tracked minutes, split by each interval's primary category. The bars on the left
            count every tracked tag a task carries, so those can total more than the day itself.
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
  day: { date: string; totalMs: number; entryCount: number; slices: { tagId: string | null; ms: number }[] }
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
        {formatDuration(day.totalMs)} · {day.entryCount} interval{day.entryCount === 1 ? '' : 's'}
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
              <span className="shrink-0 text-muted-foreground tabular-nums">{formatDuration(slice.ms)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
