import * as React from 'react'
import { CalendarClock, LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { DensityToggle } from '@/features/theme/DensityToggle'
import { useAuth } from '@/features/auth/AuthProvider'
import { TagFilterSidebar } from '@/features/tags/TagFilterSidebar'
import { useTagFilterStore } from '@/features/tags/tagFilterStore'
import { filterTasksByTags, isTagFilterEmpty } from '@/features/tags/tagFilter'
import { useUser } from '@/features/user/useUser'
import { cn } from '@/lib/utils'
import { useTasks, useCompletedTodos } from './useTasks'
import { useTags } from './useTags'
import { TaskColumn } from './TaskColumn'
import { TodoBoard } from './TodoBoard'
import { QuickAddBar } from './QuickAddBar'
import { TaskSearchBar } from './TaskSearchBar'
import { TaskListSkeleton } from './TaskListSkeleton'
import { searchTasks } from './taskSearch'
import { sortTasksByDueDate } from './taskDueDate'
import { filterCompleted, filterScheduledOnly } from './taskVisibility'
import type { DailyTask, Task, TodoTask } from '@/lib/habitica/types'

/**
 * Habits/Dailies/Rewards are short lists that used to each get a full
 * top-level column — mostly empty space next to To-Dos, the one list that
 * actually runs long. They now render as collapsible sections in the left
 * rail (see the `<aside>` below); To-Dos is the only remaining top-level
 * column, and gets the wide main area to itself.
 */
const RAIL_SECTIONS: { type: 'habit' | 'daily' | 'reward'; title: string }[] = [
  { type: 'habit', title: 'Habits' },
  { type: 'daily', title: 'Dailies' },
  { type: 'reward', title: 'Rewards' },
]

export function Dashboard() {
  const { logout } = useAuth()
  const tasksQuery = useTasks()
  const tagsQuery = useTags()
  // Fetched here so ['user'] is warm by the time anything scores — see
  // taskMutations.ts's useScoreTask and TaskCard's reward-feedback flash,
  // both of which read this cache for a before/after stats diff.
  const userQuery = useUser()
  const tagFilter = useTagFilterStore((s) => s.filter)
  const [searchQuery, setSearchQuery] = React.useState('')

  // Dailies/todos hide completed items by default (declutter, per user
  // feedback) — a per-column toggle brings them back. Todos specifically:
  // the default /tasks/user fetch omits completed todos server-side, so
  // "show completed" also gates a second request (useCompletedTodos) rather
  // than just unhiding something already in hand.
  const [showCompleted, setShowCompleted] = React.useState<{ daily: boolean; todo: boolean }>({
    daily: false,
    todo: false,
  })
  const [scheduledOnly, setScheduledOnly] = React.useState(false)
  // One control, two effects: To-Dos split into the four due-date columns
  // (see TodoBoard/todoBuckets), and Dailies sort by their next occurrence.
  // Defaults on, per explicit request that due-date sorting be the default
  // view — "new tasks go to the top" (useCreateTask's move/to/0) still
  // applies within a bucket once due dates tie (compareTodos falls back to
  // task color, not insertion order, so this is a soft trade-off, not a
  // contradiction).
  const [groupByDueDate, setGroupByDueDate] = React.useState(true)
  const completedTodosQuery = useCompletedTodos(showCompleted.todo)

  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const quickAddInputRef = React.useRef<HTMLInputElement>(null)

  const tagNamesById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const tag of tagsQuery.data ?? []) map.set(tag.id, tag.name)
    return map
  }, [tagsQuery.data])

  const globalFiltered = !isTagFilterEmpty(tagFilter) || searchQuery.trim().length > 0

  const allTasks = React.useMemo(() => {
    const base = tasksQuery.data ?? []
    if (!showCompleted.todo || !completedTodosQuery.data) return base
    return [...base, ...completedTodosQuery.data]
  }, [tasksQuery.data, showCompleted.todo, completedTodosQuery.data])

  // Two grouped snapshots: `rawByType` is after tag-filter/search only (used
  // to tell "genuinely empty" apart from "hidden by the completed/scheduled
  // toggles" for TaskColumn's empty-state message), `tasksByType` is the
  // final, fully-filtered/sorted set actually rendered.
  const { rawByType, tasksByType } = React.useMemo(() => {
    const raw: Record<Task['type'], Task[]> = { habit: [], daily: [], todo: [], reward: [] }
    const byTag = filterTasksByTags(allTasks, tagFilter)
    const bySearch = searchTasks(byTag, searchQuery)
    for (const task of bySearch) raw[task.type].push(task)

    const grouped: Record<Task['type'], Task[]> = { ...raw }
    grouped.daily = filterCompleted(grouped.daily as DailyTask[], showCompleted.daily)
    grouped.todo = filterScheduledOnly(
      filterCompleted(grouped.todo as TodoTask[], showCompleted.todo),
      scheduledOnly,
    )

    // To-Dos aren't sorted here — TodoBoard owns their ordering, since with
    // grouping on it sorts *within* each due-date bucket (soonest, then
    // reddest) rather than across one flat list.
    if (groupByDueDate) grouped.daily = sortTasksByDueDate(grouped.daily)

    return { rawByType: raw, tasksByType: grouped }
  }, [allTasks, tagFilter, searchQuery, showCompleted, scheduledOnly, groupByDueDate])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Ignore while typing anywhere (a hotkey firing mid-sentence in an
      // input/textarea/contenteditable would be actively destructive, not
      // just annoying) and while any dialog is open — its own focused
      // control may not be a text field (e.g. a button just got focus), and
      // "/"/"n" should never reach behind an open modal either way.
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      const hasOpenDialog = document.querySelector('dialog[open]') !== null
      if (isTyping || hasOpenDialog || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === '/') {
        event.preventDefault()
        searchInputRef.current?.focus()
      } else if (event.key === 'n') {
        event.preventDefault()
        quickAddInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    // Full window width — no max-w cap. The old 7xl (1280px) cap left most
    // of a wide monitor empty on both sides, which is exactly the space the
    // multi-column To-Dos board and the widened rail are here to use.
    <div className="flex min-h-dvh w-full flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold">Habitica</h1>
          {userQuery.data && (
            <p className="text-xs text-muted-foreground">
              Lvl {userQuery.data.stats.lvl} · {Math.round(userQuery.data.stats.gp)} gold
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DensityToggle />
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Log out" onClick={logout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <QuickAddBar inputRef={quickAddInputRef} />
        <div className="flex items-center gap-2">
          <TaskSearchBar value={searchQuery} onChange={setSearchQuery} inputRef={searchInputRef} />
          <Button
            type="button"
            variant="outline"
            aria-pressed={groupByDueDate}
            title={
              groupByDueDate
                ? 'Grouping To-Dos by due date; Dailies sorted by next due'
                : 'Group To-Dos into Today / This week / Later / Someday'
            }
            onClick={() => setGroupByDueDate((v) => !v)}
            className={cn('shrink-0', groupByDueDate && 'border-primary text-primary')}
          >
            <CalendarClock className="size-4" /> By due date
          </Button>
        </div>
      </div>

      {tasksQuery.isPending && <TaskListSkeleton />}

      {tasksQuery.isError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm text-destructive">Couldn't load tasks: {tasksQuery.error.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void tasksQuery.refetch()}>
            <RefreshCw className="size-3" /> Try again
          </Button>
        </div>
      )}

      {tasksQuery.isSuccess && (
        // Rail (tag filter + Habits/Dailies/Rewards) sits beside To-Dos only
        // from lg (1024px) up — below that it stacks above To-Dos instead,
        // same reasoning as the old sidebar-only-at-lg fix this replaced
        // (56px-of-sidebar + a cramped column at any narrower width is
        // unusable). On large screens the rail sticks and scrolls within
        // the viewport independently of the page — it's a "smart resizing"
        // measure for someone with a lot of habits/dailies, layered with
        // each section's own 45dvh cap + collapse toggle (TaskColumn).
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* Rail is wider than a typical sidebar (up to 24rem) because it
              holds real task cards, not just filter controls — habits and
              dailies need room to be readable, not just present. It sticks
              and scrolls within the viewport independently of the (much
              taller) To-Dos board beside it. */}
          <div className="flex w-full shrink-0 flex-col gap-6 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:w-80 lg:overflow-y-auto lg:pr-2 xl:w-96">
            <div className="flex flex-col gap-5">
              {RAIL_SECTIONS.map(({ type, title }) => (
                <TaskColumn
                  key={type}
                  type={type}
                  title={title}
                  tasks={tasksByType[type]}
                  tagNamesById={tagNamesById}
                  isFiltered={globalFiltered || rawByType[type].length > tasksByType[type].length}
                  completedVisible={type === 'daily' ? showCompleted.daily : undefined}
                  onToggleCompletedVisible={
                    type === 'daily' ? () => setShowCompleted((s) => ({ ...s, daily: !s.daily })) : undefined
                  }
                  collapsible
                />
              ))}
            </div>
            {/* Tags sit below the task sections now — they're a control
                surface you reach for occasionally, whereas the task lists
                above are what you're actually looking at. */}
            <div className="border-t border-border pt-5">
              <TagFilterSidebar />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <TodoBoard
              tasks={tasksByType.todo as TodoTask[]}
              tagNamesById={tagNamesById}
              isFiltered={globalFiltered || rawByType.todo.length > tasksByType.todo.length}
              grouped={groupByDueDate}
              completedVisible={showCompleted.todo}
              onToggleCompletedVisible={() => setShowCompleted((s) => ({ ...s, todo: !s.todo }))}
              scheduledOnly={scheduledOnly}
              onToggleScheduledOnly={() => setScheduledOnly((v) => !v)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
