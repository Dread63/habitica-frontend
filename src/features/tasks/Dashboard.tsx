import * as React from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { useAuth } from '@/features/auth/AuthProvider'
import { useTasks } from './useTasks'
import { useTags } from './useTags'
import { TaskColumn } from './TaskColumn'
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

  const tagNamesById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const tag of tagsQuery.data ?? []) map.set(tag.id, tag.name)
    return map
  }, [tagsQuery.data])

  const tasksByType = React.useMemo(() => {
    const grouped: Record<Task['type'], Task[]> = { habit: [], daily: [], todo: [], reward: [] }
    for (const task of tasksQuery.data ?? []) grouped[task.type].push(task)
    return grouped
  }, [tasksQuery.data])

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Habitica</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Log out" onClick={logout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {tasksQuery.isPending && <p className="text-sm text-muted-foreground">Loading tasks…</p>}

      {tasksQuery.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load tasks: {tasksQuery.error.message}
        </p>
      )}

      {tasksQuery.isSuccess && (
        <div className="flex flex-col gap-6 sm:flex-row">
          {COLUMNS.map(({ type, title }) => (
            <TaskColumn key={type} title={title} tasks={tasksByType[type]} tagNamesById={tagNamesById} />
          ))}
        </div>
      )}
    </div>
  )
}
