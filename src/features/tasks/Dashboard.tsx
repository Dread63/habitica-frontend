import * as React from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { DensityToggle } from '@/features/theme/DensityToggle'
import { useAuth } from '@/features/auth/AuthProvider'
import { TagFilterSidebar } from '@/features/tags/TagFilterSidebar'
import { useTagFilterStore } from '@/features/tags/tagFilterStore'
import { filterTasksByTags, isTagFilterEmpty } from '@/features/tags/tagFilter'
import { useUser } from '@/features/user/useUser'
import { useTasks } from './useTasks'
import { useTags } from './useTags'
import { TaskColumn } from './TaskColumn'
import { QuickAddBar } from './QuickAddBar'
import { TaskSearchBar } from './TaskSearchBar'
import { TaskListSkeleton } from './TaskListSkeleton'
import { searchTasks } from './taskSearch'
import type { Task } from '@/lib/habitica/types'

const COLUMNS: { type: Task['type']; title: string }[] = [
  { type: 'habit', title: 'Habits' },
  { type: 'daily', title: 'Dailies' },
  { type: 'todo', title: 'To-Dos' },
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

  const tagNamesById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const tag of tagsQuery.data ?? []) map.set(tag.id, tag.name)
    return map
  }, [tagsQuery.data])

  const isFiltered = !isTagFilterEmpty(tagFilter) || searchQuery.trim().length > 0

  const tasksByType = React.useMemo(() => {
    const grouped: Record<Task['type'], Task[]> = { habit: [], daily: [], todo: [], reward: [] }
    const byTag = filterTasksByTags(tasksQuery.data ?? [], tagFilter)
    const bySearch = searchTasks(byTag, searchQuery)
    for (const task of bySearch) grouped[task.type].push(task)
    return grouped
  }, [tasksQuery.data, tagFilter, searchQuery])

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Habitica</h1>
          {userQuery.data && (
            <p className="text-xs text-muted-foreground">
              Lvl {userQuery.data.stats.lvl} · {Math.round(userQuery.data.stats.gp)} gold
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DensityToggle />
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Log out" onClick={logout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <QuickAddBar />
        <TaskSearchBar value={searchQuery} onChange={setSearchQuery} />
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
        <div className="flex flex-col gap-6 sm:flex-row">
          <TagFilterSidebar />
          <div className="flex min-w-0 flex-1 flex-col gap-6 sm:flex-row">
            {COLUMNS.map(({ type, title }) => (
              <TaskColumn
                key={type}
                type={type}
                title={title}
                tasks={tasksByType[type]}
                tagNamesById={tagNamesById}
                isFiltered={isFiltered}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
