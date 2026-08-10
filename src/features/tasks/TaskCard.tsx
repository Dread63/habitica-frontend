import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQueryClient } from '@tanstack/react-query'
import { Circle, CircleCheck, ChevronUp, ChevronDown, Coins, Flame, Pencil, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTwemoji } from '@/lib/useTwemoji'
import type { HabiticaUser, Task } from '@/lib/habitica/types'
import { useUser } from '@/features/user/useUser'
import { useDensity } from '@/features/theme/DensityProvider'
import { PRIORITY_LABELS } from './priority'
import { getTaskColorSwatch } from './taskColor'
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

  function handleDelete() {
    if (window.confirm(`Delete "${task.text}"? This can't be undone.`)) {
      deleteTask.mutate(task.id)
    }
  }

  return (
    <Card
      className={cn('flex items-start border-l-4', isCompact ? 'gap-2 p-2' : 'gap-3 p-3')}
      style={{ borderLeftColor: swatch.accent }}
    >
      <div className="relative mt-0.5 shrink-0 text-muted-foreground">
        <Indicator
          task={task}
          isScoring={scoreTask.isPending}
          onScore={handleScore}
          canAffordReward={canAffordReward}
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
                  'text-sm leading-snug',
                  'completed' in task && task.completed && 'text-muted-foreground line-through',
                )}
              >
                {task.text}
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
                  'prose prose-sm line-clamp-3 max-w-none cursor-pointer text-xs text-muted-foreground',
                  'prose-p:my-0.5 prose-headings:my-1 prose-headings:text-foreground',
                  'prose-a:text-primary prose-strong:text-foreground prose-li:my-0',
                  'dark:prose-invert',
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.notes}</ReactMarkdown>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={`Edit ${task.text}`}
              onClick={() => editDialogRef.current?.open('form')}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={`Delete ${task.text}`}
              disabled={deleteTask.isPending}
              onClick={handleDelete}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>

        {checklist !== undefined && (
          <ChecklistSection taskId={task.id} items={checklist} summaryOnly={isCompact} />
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.type === 'daily' && task.streak > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Flame className="size-3" /> {task.streak}
            </span>
          )}
          {task.type === 'reward' && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Coins className="size-3" /> {task.value}
            </span>
          )}
          {task.tags.map((tagId) => (
            <span
              key={tagId}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
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

function Indicator({
  task,
  onScore,
  isScoring,
  canAffordReward,
}: {
  task: Task
  onScore: (direction: 'up' | 'down') => void
  isScoring: boolean
  canAffordReward: boolean
}) {
  if (task.type === 'habit') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          disabled={!task.up || isScoring}
          onClick={() => onScore('up')}
          aria-label="Score up"
          className="disabled:opacity-25"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={!task.down || isScoring}
          onClick={() => onScore('down')}
          aria-label="Score down"
          className="disabled:opacity-25"
        >
          <ChevronDown className="size-3.5" />
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
        className="disabled:opacity-40"
      >
        <Coins className="size-4" />
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
    >
      {task.completed ? <CircleCheck className="size-4 text-primary" /> : <Circle className="size-4" />}
    </button>
  )
}
