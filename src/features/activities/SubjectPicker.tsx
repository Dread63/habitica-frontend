import * as React from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import { Input } from '@/components/ui/input'
import type { Task } from '@/lib/habitica/types'
import { TASK_TYPE_META } from '@/features/tasks/taskType'
import { searchTasks } from '@/features/tasks/taskSearch'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { recentActivities, searchActivities } from './recentActivities'
import { subjectOfActivity, subjectOfTask, type TimeSubject } from './subject'

const ACTIVITY_LIMIT = 8
const TASK_LIMIT = 12

/**
 * One searchable combobox over everything time can be spent on: your tasks,
 * the activities you've used before, and a "create it" row for a label that is
 * neither.
 *
 * It exists because the app had three separate unsearchable subject pickers —
 * a native `<select>` of every focusable task in PomodoroPanel, another in the
 * interval editor, and no way at all to name something that wasn't a task.
 * Replacing all three with one component is what keeps the "start tracking",
 * "correct this interval" and "plan this block" flows behaving identically.
 *
 * Search is `searchTasks` verbatim — the Dashboard's engine, with its
 * title → subtask → notes ranking — so finding a task means the same thing
 * everywhere. Activities are matched on their label only, which is all they
 * have; claiming the same three tiers for them would be dishonest.
 */
export function SubjectPicker({
  value,
  onChange,
  tasks,
  placeholder = 'Search tasks, or name an activity…',
  autoFocus = false,
  allowCreate = true,
  emptyLabel = 'Nothing matches.',
}: {
  value: TimeSubject | null
  onChange: (subject: TimeSubject) => void
  /** Already narrowed by the caller — schedulable types, focusable types, etc.
   * This component applies no eligibility rule of its own. */
  tasks: Task[]
  placeholder?: string
  autoFocus?: boolean
  /** Off where a free-text subject makes no sense. */
  allowCreate?: boolean
  emptyLabel?: string
}) {
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const ledger = useTimeEntryStore((s) => s.entries)
  const plan = useTimelineEntryStore((s) => s.entries)
  const activities = React.useMemo(() => recentActivities(ledger, plan), [ledger, plan])

  const matchedTasks = React.useMemo(() => searchTasks(tasks, query).slice(0, TASK_LIMIT), [tasks, query])
  const matchedActivities = React.useMemo(
    () => searchActivities(activities, query).slice(0, ACTIVITY_LIMIT),
    [activities, query],
  )

  // Only offer to create when the typed label isn't already an activity —
  // otherwise "IT support" would show as both a suggestion and a new thing.
  const draft = allowCreate ? subjectOfActivity(query) : null
  const canCreate = draft !== null && !activities.some((a) => a.id === draft.id)

  // Click-away. Escape is handled on the input so it doesn't fight a wrapping
  // dialog's own Escape handling until the list is actually closed.
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function choose(subject: TimeSubject) {
    onChange(subject)
    setQuery('')
    setOpen(false)
  }

  const listId = React.useId()

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1" data-no-drag>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={open ? query : (value?.text ?? '')}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={(event) => {
            setOpen(true)
            event.target.select()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.stopPropagation()
              setOpen(false)
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              const first = matchedTasks[0] ?? null
              if (first) choose(subjectOfTask(first))
              else if (matchedActivities[0]) choose(matchedActivities[0])
              else if (canCreate) choose(draft)
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className="pr-7 pl-8"
        />
        <ChevronDown
          className={cn(
            'pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-40 mt-1 flex max-h-72 flex-col overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg"
        >
          {matchedTasks.length > 0 && (
            <SectionLabel>Tasks</SectionLabel>
          )}
          {matchedTasks.map((task) => (
            <SubjectRow
              key={task.id}
              text={task.text}
              accent={TASK_TYPE_META[task.type].accent}
              selected={value?.id === task.id}
              onSelect={() => choose(subjectOfTask(task))}
            />
          ))}

          {matchedActivities.length > 0 && <SectionLabel>Activities</SectionLabel>}
          {matchedActivities.map((activity) => (
            <SubjectRow
              key={activity.id}
              text={activity.text}
              accent="var(--muted-foreground)"
              selected={value?.id === activity.id}
              onSelect={() => choose(activity)}
            />
          ))}

          {canCreate && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => choose(draft)}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <Plus className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">
                Track “<span className="font-medium">{draft.text}</span>” as an activity
              </span>
            </button>
          )}

          {matchedTasks.length === 0 && matchedActivities.length === 0 && !canCreate && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
}

function SubjectRow({
  text,
  accent,
  selected,
  onSelect,
}: {
  text: string
  accent: string
  selected: boolean
  onSelect: () => void
}) {
  // Both emoji steps, as every surface rendering task text must have — see
  // docs/gotchas.md § React / rendering.
  const ref = useTwemoji<HTMLSpanElement>([text])

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
      <span ref={ref} className="min-w-0 flex-1 truncate">
        {emojify(text)}
      </span>
      {selected && <Check className="size-3.5 shrink-0 text-primary" />}
    </button>
  )
}
