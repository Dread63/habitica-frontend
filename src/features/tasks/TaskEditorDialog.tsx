import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Pencil } from 'lucide-react'
import { Dialog, type DialogHandle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useTwemoji } from '@/lib/useTwemoji'
import { useCreateTask, useUpdateTask } from './taskMutations'
import { useTags } from './useTags'
import { PRIORITY_LABELS } from './priority'
import { ChecklistSection } from './ChecklistSection'
import { TASK_TYPE_META } from './taskType'
import type { CreateTaskInput, DailyRepeat, Task, TaskPriority, TaskType } from '@/lib/habitica/types'

const DAY_KEYS: (keyof DailyRepeat)[] = ['su', 'm', 't', 'w', 'th', 'f', 's']
const DAY_LABELS: Record<keyof DailyRepeat, string> = {
  su: 'Su',
  m: 'M',
  t: 'Tu',
  w: 'W',
  th: 'Th',
  f: 'F',
  s: 'Sa',
}
const DEFAULT_REPEAT: DailyRepeat = { su: true, m: true, t: true, w: true, th: true, f: true, s: true }

interface FormState {
  text: string
  notes: string
  priority: TaskPriority
  tags: string[]
  up: boolean
  down: boolean
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  everyX: number
  repeat: DailyRepeat
  date: string
  value: number
}

function defaultFormState(): FormState {
  return {
    text: '',
    notes: '',
    priority: 1,
    tags: [],
    up: true,
    down: true,
    frequency: 'daily',
    everyX: 1,
    repeat: DEFAULT_REPEAT,
    date: '',
    value: 10,
  }
}

function formStateFromTask(task: Task): FormState {
  return {
    text: task.text,
    notes: task.notes,
    priority: task.priority,
    tags: task.tags,
    up: task.type === 'habit' ? task.up : true,
    down: task.type === 'habit' ? task.down : true,
    frequency: task.type === 'daily' ? task.frequency : 'daily',
    everyX: task.type === 'daily' ? task.everyX : 1,
    repeat: task.type === 'daily' ? task.repeat : DEFAULT_REPEAT,
    date: task.type === 'todo' && task.date ? task.date.slice(0, 10) : '',
    value: task.type === 'reward' ? task.value : 10,
  }
}

function toInput(type: TaskType, form: FormState): CreateTaskInput {
  const input: CreateTaskInput = {
    type,
    text: form.text,
    notes: form.notes,
    priority: form.priority,
    tags: form.tags,
  }
  if (type === 'habit') {
    input.up = form.up
    input.down = form.down
  } else if (type === 'daily') {
    input.frequency = form.frequency
    input.everyX = form.everyX
    if (form.frequency === 'weekly') input.repeat = form.repeat
  } else if (type === 'todo' && form.date) {
    input.date = form.date
  } else if (type === 'reward') {
    input.value = form.value
  }
  return input
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type TaskEditorDialogProps = { mode: 'create'; type: TaskType } | { mode: 'edit'; task: Task }

export interface TaskEditorHandle {
  /** Edit mode defaults to 'view' (the read-focused detail layout) when no
   * argument is given; create mode always opens straight to the form. */
  open: (initialSubView?: 'view' | 'form') => void
  close: () => void
}

/** Shared create/edit/view — a discriminated `mode` prop instead of optional
 * fields so the component can't be called in an ambiguous state (task
 * omitted in edit mode, type omitted in create mode). */
export const TaskEditorDialog = React.forwardRef<TaskEditorHandle, TaskEditorDialogProps>((props, ref) => {
  const type = props.mode === 'create' ? props.type : props.task.type
  const [form, setForm] = React.useState<FormState>(() =>
    props.mode === 'edit' ? formStateFromTask(props.task) : defaultFormState(),
  )
  // Only meaningful in edit mode — create always renders the form.
  const [subView, setSubView] = React.useState<'view' | 'form'>('view')
  const tagsQuery = useTags()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const dialogRef = React.useRef<DialogHandle>(null)

  React.useImperativeHandle(ref, () => ({
    open: (initialSubView) => {
      setForm(props.mode === 'edit' ? formStateFromTask(props.task) : defaultFormState())
      setSubView(props.mode === 'create' ? 'form' : (initialSubView ?? 'view'))
      dialogRef.current?.open()
    },
    close: () => dialogRef.current?.close(),
  }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input = toInput(type, form)
    if (props.mode === 'edit') {
      await updateTask.mutateAsync({ taskId: props.task.id, input })
    } else {
      await createTask.mutateAsync(input)
    }
    dialogRef.current?.close()
  }

  function handleCancelEdit() {
    if (props.mode === 'edit') setForm(formStateFromTask(props.task))
    setSubView('view')
  }

  const isSubmitting = createTask.isPending || updateTask.isPending
  const mutationError = createTask.error ?? updateTask.error
  const showForm = props.mode === 'create' || subView === 'form'

  const title = props.mode === 'create' ? `New ${type}` : showForm ? `Edit ${type}` : capitalize(type)
  const { icon: TypeIcon, accent } = TASK_TYPE_META[type]

  return (
    <Dialog
      ref={dialogRef}
      title={title}
      icon={<TypeIcon className="size-4" style={{ color: accent }} aria-hidden="true" />}
    >
      {showForm ? (
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <Field label="Title">
            <Input value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} required />
          </Field>

          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Markdown supported"
            />
          </Field>

          <Field label="Difficulty">
            <Select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) as TaskPriority }))}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          {type === 'habit' && (
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={form.up} onChange={(e) => setForm((f) => ({ ...f, up: e.target.checked }))} />
                Track positive (+)
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={form.down} onChange={(e) => setForm((f) => ({ ...f, down: e.target.checked }))} />
                Track negative (−)
              </label>
            </div>
          )}

          {type === 'daily' && (
            <>
              <Field label="Repeats">
                <Select
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as FormState['frequency'] }))}
                >
                  <option value="daily">Every X days</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </Select>
              </Field>
              {form.frequency === 'daily' && (
                <Field label="Every X days">
                  <Input
                    type="number"
                    min={1}
                    value={form.everyX}
                    onChange={(e) => setForm((f) => ({ ...f, everyX: Number(e.target.value) }))}
                  />
                </Field>
              )}
              {form.frequency === 'weekly' && (
                <Field label="On these days">
                  <div className="flex gap-1">
                    {DAY_KEYS.map((day) => (
                      <button
                        type="button"
                        key={day}
                        onClick={() => setForm((f) => ({ ...f, repeat: { ...f.repeat, [day]: !f.repeat[day] } }))}
                        aria-pressed={form.repeat[day]}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                          form.repeat[day] ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {DAY_LABELS[day]}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {(form.frequency === 'monthly' || form.frequency === 'yearly') && (
                <p className="text-xs text-muted-foreground">
                  Specific days-of-month/year scheduling isn't in this editor yet — the task is
                  created with Habitica's default for {form.frequency} frequency; adjust further
                  on habitica.com if needed.
                </p>
              )}
            </>
          )}

          {type === 'todo' && (
            <Field label="Due date (optional)">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
          )}

          {type === 'reward' && (
            <Field label="Cost (gold)">
              <Input
                type="number"
                min={0}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
              />
            </Field>
          )}

          {tagsQuery.data && tagsQuery.data.length > 0 && (
            <Field label="Tags">
              <div className="flex flex-wrap gap-2">
                {tagsQuery.data.map((tag) => (
                  <label key={tag.id} className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={form.tags.includes(tag.id)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          tags: e.target.checked ? [...f.tags, tag.id] : f.tags.filter((t) => t !== tag.id),
                        }))
                      }
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </Field>
          )}

          {mutationError && (
            <p role="alert" className="text-sm text-destructive">
              {mutationError instanceof Error ? mutationError.message : 'Something went wrong.'}
            </p>
          )}

          <div className="mt-1 flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : props.mode === 'edit' ? 'Save changes' : 'Create'}
            </Button>
            {props.mode === 'edit' && (
              <Button type="button" variant="ghost" onClick={handleCancelEdit} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        props.mode === 'edit' && (
          <TaskDetailView
            task={props.task}
            tagNames={(tagsQuery.data ?? []).filter((t) => props.task.tags.includes(t.id)).map((t) => t.name)}
            onEdit={() => setSubView('form')}
          />
        )
      )}
    </Dialog>
  )
})
TaskEditorDialog.displayName = 'TaskEditorDialog'

/** The read-focused layout requested explicitly — full-width markdown, full
 * checklist, no card-sized truncation. Checklist stays interactive (reuses
 * the same ChecklistSection as the compact card) since there was no reason
 * to make this view read-only when the mutations already existed. */
function TaskDetailView({ task, tagNames, onEdit }: { task: Task; tagNames: string[]; onEdit: () => void }) {
  const textRef = useTwemoji<HTMLHeadingElement>([task.text])
  const notesRef = useTwemoji<HTMLDivElement>([task.notes])
  const checklist = 'checklist' in task ? task.checklist : undefined

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 ref={textRef} className="text-base leading-snug font-semibold">
          {task.text}
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={onEdit} className="shrink-0">
          <Pencil className="size-3" /> Edit
        </Button>
      </div>

      {task.notes ? (
        <div
          ref={notesRef}
          className="prose prose-sm dark:prose-invert prose-a:text-primary max-w-none"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.notes}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No notes.</p>
      )}

      {checklist !== undefined && <ChecklistSection taskId={task.id} items={checklist} />}

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
        <div className="flex items-center gap-1">
          <dt className="font-medium text-foreground">Difficulty</dt>
          <dd className="text-muted-foreground">{PRIORITY_LABELS[task.priority]}</dd>
        </div>
        {task.type === 'daily' && (
          <div className="flex items-center gap-1">
            <dt className="font-medium text-foreground">Streak</dt>
            <dd className="text-muted-foreground">{task.streak}</dd>
          </div>
        )}
        {task.type === 'reward' && (
          <div className="flex items-center gap-1">
            <dt className="font-medium text-foreground">Cost</dt>
            <dd className="text-muted-foreground">{task.value} gold</dd>
          </div>
        )}
        {task.type === 'todo' && task.date && (
          <div className="flex items-center gap-1">
            <dt className="font-medium text-foreground">Due</dt>
            <dd className="text-muted-foreground">{new Date(task.date).toLocaleDateString()}</dd>
          </div>
        )}
        {task.type === 'habit' && (
          <div className="flex items-center gap-1">
            <dt className="font-medium text-foreground">Tracks</dt>
            <dd className="text-muted-foreground">
              {[task.up && '+', task.down && '−'].filter(Boolean).join(' / ') || 'neither (disabled)'}
            </dd>
          </div>
        )}
      </dl>

      {tagNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tagNames.map((name) => (
            <span key={name} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
