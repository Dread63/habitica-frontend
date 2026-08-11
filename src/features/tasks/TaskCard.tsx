import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Circle, CircleCheck, ChevronUp, ChevronDown, Coins, Flame, Pencil, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { confirmDialog } from '@/components/ui/confirmStore'
import { emojify } from '@/lib/emoji'
import { useTwemoji } from '@/lib/useTwemoji'
import type { HabiticaUser, Task } from '@/lib/habitica/types'
import { useUser } from '@/features/user/useUser'
import { useDensity } from '@/features/theme/DensityProvider'
import { PRIORITY_LABELS } from './priority'
import { getTaskColorSwatch } from './taskColor'
import { formatDueDate, getDueDate, isOverdue } from './taskDueDate'
import { TaskEditorDialog, type TaskEditorHandle } from './TaskEditorDialog'
import { ChecklistSection } from './ChecklistSection'
import { useDeleteTask, useScoreTask } from './taskMutations'

interface TaskCardProps {
  task: Task
  /** Tag id -> name, so cards can show tag names without each doing its own lookup. */
  tagNamesById: ReadonlyMap<string, string>
}

interface ScoreFlashData {
  /** undefined, not 0, when a level-up makes the raw diff meaningless (exp
   * resets on level-up — see handleScore). */
  expGained?: number
  gpGained: number
  hpChange: number
  leveledUp: boolean
}

/**
 * Read-focused detail view lives in TaskEditorDialog (opened in 'view' mode)
 * — clicking the title/notes area here opens that; the pencil icon opens
 * straight to the form. Both share one dialog instance/ref.
 */
export function TaskCard({ task, tagNamesById }: TaskCardProps) {
  const swatch = getTaskColorSwatch(task)
  const dueDate = getDueDate(task)
  const overdue = isOverdue(task)
  const textRef = useTwemoji<HTMLParagraphElement>([task.text])
  const notesRef = useTwemoji<HTMLDivElement>([task.notes])
  const checklist = 'checklist' in task ? task.checklist : undefined

  const { density } = useDensity()
  const isCompact = density === 'compact'
  const queryClient = useQueryClient()
  const userQuery = useUser()
  const scoreTask = useScoreTask()
  const deleteTask = useDeleteTask()
  const editDialogRef = React.useRef<TaskEditorHandle>(null)
  const [scoreFlash, setScoreFlash] = React.useState<ScoreFlashData | null>(null)
  const flashTimeoutRef = React.useRef<number | undefined>(undefined)

  // Undefined gold (query not loaded yet) reads as "affordable" rather than
  // false-disabling the button before we actually know.
  const canAffordReward = task.type !== 'reward' || (userQuery.data?.stats.gp ?? Infinity) >= task.value

  // Metadata pills: readable at comfortable density (the 11px they used to
  // be sat below what's comfortable to scan), still tight in compact.
  const badgeClass = isCompact
    ? 'rounded-full px-2 py-0.5 text-[11px]'
    : 'rounded-full px-2.5 py-1 text-xs'
  const badgeIconClass = isCompact ? 'size-3' : 'size-3.5'

  React.useEffect(() => () => window.clearTimeout(flashTimeoutRef.current), [])

  function handleScore(direction: 'up' | 'down') {
    const statsBefore = queryClient.getQueryData<HabiticaUser>(['user'])?.stats
    scoreTask.mutate(
      { taskId: task.id, direction },
      {
        onSuccess: (result) => {
          if (!statsBefore) return // no baseline yet (e.g. first action before ['user'] loaded) — skip the flash, not worth a wrong number
          const leveledUp = result.lvl > statsBefore.lvl
          setScoreFlash({
            // exp resets on level-up, so a raw diff would show a nonsensical
            // large negative number — omit it rather than show something wrong.
            expGained: leveledUp ? undefined : result.exp - statsBefore.exp,
            gpGained: result.gp - statsBefore.gp,
            hpChange: result.hp - statsBefore.hp,
            leveledUp,
          })
          window.clearTimeout(flashTimeoutRef.current)
          flashTimeoutRef.current = window.setTimeout(() => setScoreFlash(null), 1800)
        },
      },
    )
  }

  async function handleDelete() {
    const confirmed = await confirmDialog({
      title: 'Delete task?',
      message: `Delete "${task.text}"? This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (confirmed) deleteTask.mutate(task.id)
  }

  return (
    <Card
      className={cn(
        'flex items-start border-l-4 transition-shadow duration-150 hover:shadow-md',
        'animate-[task-in_180ms_ease-out]',
        isCompact ? 'gap-2 p-2' : 'gap-3 p-4',
      )}
      style={{ borderLeftColor: swatch.accent }}
    >
      <div className={cn('relative shrink-0 text-muted-foreground', isCompact ? 'mt-0.5' : 'mt-px')}>
        <Indicator
          task={task}
          isScoring={scoreTask.isPending}
          onScore={handleScore}
          canAffordReward={canAffordReward}
          isCompact={isCompact}
        />
        {scoreFlash && <ScoreFlash data={scoreFlash} />}
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col', isCompact ? 'gap-0.5' : 'gap-1')}>
        <div className="flex items-start justify-between gap-2">
          {/* Clickable zone is title+notes. Notes can contain markdown links,
              which can't legally nest inside a <button> — so only the title
              is a real button (keyboard-accessible entry point); the notes
              preview is a plain div with its own onClick for mouse users,
              guarded so clicking a link inside it navigates instead of also
              opening the dialog. Kept as siblings of the edit/delete buttons
              below, not a wrapper around them, so nothing needs stopPropagation. */}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => editDialogRef.current?.open('view')}
              className="block w-full text-left"
              aria-label={`View ${task.text}`}
            >
              <p
                ref={textRef}
                className={cn(
                  'leading-snug',
                  isCompact ? 'text-sm' : 'text-base',
                  'completed' in task && task.completed && 'text-muted-foreground line-through',
                )}
              >
                {emojify(task.text)}
              </p>
            </button>
            {/* Compact density skips the notes preview entirely (that's the
                point — fewer lines per card); full notes are always one
                click away via the detail view. */}
            {task.notes && !isCompact && (
              <div
                ref={notesRef}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) return // let the link navigate instead
                  editDialogRef.current?.open('view')
                }}
                className={cn(
                  'prose prose-sm line-clamp-3 max-w-none cursor-pointer text-sm text-muted-foreground',
                  'prose-p:my-1 prose-headings:my-1 prose-headings:text-foreground',
                  'prose-a:text-primary prose-strong:text-foreground prose-li:my-0',
                  'dark:prose-invert',
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{emojify(task.notes)}</ReactMarkdown>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={isCompact ? 'h-6 w-6' : 'h-8 w-8'}
              aria-label={`Edit ${task.text}`}
              onClick={() => editDialogRef.current?.open('form')}
            >
              <Pencil className={isCompact ? 'size-3' : 'size-4'} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={isCompact ? 'h-6 w-6' : 'h-8 w-8'}
              aria-label={`Delete ${task.text}`}
              disabled={deleteTask.isPending}
              onClick={handleDelete}
            >
              <Trash2 className={isCompact ? 'size-3' : 'size-4'} />
            </Button>
          </div>
        </div>

        {checklist !== undefined && (
          <ChecklistSection taskId={task.id} items={checklist} summaryOnly={isCompact} />
        )}

        <div className={cn('flex flex-wrap items-center gap-1.5', isCompact ? 'pt-0.5' : 'pt-1')}>
          <span className={cn(badgeClass, 'bg-muted font-medium text-muted-foreground')}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.type === 'daily' && task.streak > 0 && (
            <span className={cn(badgeClass, 'inline-flex items-center gap-1 bg-muted font-medium text-muted-foreground')}>
              <Flame className={badgeIconClass} /> {task.streak}
            </span>
          )}
          {task.type === 'reward' && (
            <span className={cn(badgeClass, 'inline-flex items-center gap-1 bg-muted font-medium text-muted-foreground')}>
              <Coins className={badgeIconClass} /> {task.value}
            </span>
          )}
          {dueDate && (
            <span
              className={cn(
                badgeClass,
                'inline-flex items-center gap-1 font-medium',
                overdue ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground',
              )}
              title={overdue ? 'Overdue' : task.type === 'daily' ? 'Next due' : 'Due date'}
            >
              <CalendarClock className={badgeIconClass} /> {formatDueDate(dueDate)}
            </span>
          )}
          {task.tags.map((tagId) => (
            <span key={tagId} className={cn(badgeClass, 'border border-border text-muted-foreground')}>
              {tagNamesById.get(tagId) ?? '…'}
            </span>
          ))}
        </div>
      </div>

      <TaskEditorDialog ref={editDialogRef} mode="edit" task={task} />
    </Card>
  )
}

function ScoreFlash({ data }: { data: ScoreFlashData }) {
  const parts: string[] = []
  if (data.expGained !== undefined && data.expGained > 0) parts.push(`+${Math.round(data.expGained)} XP`)
  if (data.gpGained !== 0) parts.push(`${data.gpGained > 0 ? '+' : ''}${Math.round(data.gpGained * 10) / 10} GP`)
  if (data.hpChange < -0.05) parts.push(`${Math.round(data.hpChange)} HP`)
  if (parts.length === 0 && !data.leveledUp) return null

  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute -top-2 left-6 z-10 animate-[fade-up_1.8s_ease-out_forwards]',
        'rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-md',
      )}
    >
      {data.leveledUp && <span className="text-primary">Level up!</span>}
      {data.leveledUp && parts.length > 0 && ' · '}
      {parts.join(' · ')}
    </div>
  )
}

/**
 * The primary interaction on every card — scoring. At comfortable density
 * these get a real hit target (a padded ~32px box around a size-5 icon)
 * rather than a bare icon: they were previously small enough to be fiddly
 * to hit, which is a bad trait for the control you press most often.
 * Compact keeps the old tighter sizing, since that's the point of compact.
 */
function Indicator({
  task,
  onScore,
  isScoring,
  canAffordReward,
  isCompact,
}: {
  task: Task
  onScore: (direction: 'up' | 'down') => void
  isScoring: boolean
  canAffordReward: boolean
  isCompact: boolean
}) {
  const hit = cn(
    'flex items-center justify-center rounded-md transition-[transform,background-color] active:scale-90',
    'hover:bg-muted disabled:hover:bg-transparent disabled:active:scale-100',
    isCompact ? 'size-5' : 'size-8',
  )
  const icon = isCompact ? 'size-4' : 'size-5'

  if (task.type === 'habit') {
    return (
      <div className={cn('flex flex-col items-center', isCompact ? 'gap-0.5' : 'gap-1')}>
        <button
          type="button"
          disabled={!task.up || isScoring}
          onClick={() => onScore('up')}
          aria-label="Score up"
          className={cn(hit, 'disabled:opacity-25')}
        >
          <ChevronUp className={icon} />
        </button>
        <button
          type="button"
          disabled={!task.down || isScoring}
          onClick={() => onScore('down')}
          aria-label="Score down"
          className={cn(hit, 'disabled:opacity-25')}
        >
          <ChevronDown className={icon} />
        </button>
      </div>
    )
  }
  if (task.type === 'reward') {
    return (
      <button
        type="button"
        disabled={isScoring || !canAffordReward}
        onClick={() => onScore('up')}
        aria-label={`Buy ${task.text}`}
        title={canAffordReward ? undefined : 'Not enough gold'}
        className={cn(hit, 'disabled:opacity-40')}
      >
        <Coins className={icon} />
      </button>
    )
  }
  // daily / todo
  return (
    <button
      type="button"
      disabled={isScoring}
      onClick={() => onScore(task.completed ? 'down' : 'up')}
      aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
      className={hit}
    >
      {task.completed ? <CircleCheck className={cn(icon, 'text-primary')} /> : <Circle className={icon} />}
    </button>
  )
}
