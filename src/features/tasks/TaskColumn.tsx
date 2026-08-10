import type { Task } from '@/lib/habitica/types'
import { TaskCard } from './TaskCard'

interface TaskColumnProps {
  title: string
  tasks: Task[]
  tagNamesById: ReadonlyMap<string, string>
}

export function TaskColumn({ title, tasks, tagNamesById }: TaskColumnProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} <span className="text-muted-foreground/70">({tasks.length})</span>
      </h2>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">Nothing here.</p>
        )}
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} tagNamesById={tagNamesById} />
        ))}
      </div>
    </section>
  )
}
