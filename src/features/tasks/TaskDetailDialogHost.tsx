import * as React from 'react'
import type { Task } from '@/lib/habitica/types'
import { TaskEditorDialog, type TaskEditorHandle } from './TaskEditorDialog'

/**
 * Opens TaskEditorDialog's read-focused detail view for one task, mounted on
 * demand and unmounted when it closes.
 *
 * TaskCard owns a permanently-mounted dialog per card and drives it through
 * a ref, which is right there — there's one card per task already. The
 * timeline needs the same view from a *block*, where the task isn't known
 * until the click, so the shape inverts: the caller holds `selectedTask` in
 * state and renders this, which shows the dialog on mount and reports the
 * native close event back so the caller can drop it again. Keyed by task id
 * at the call site, so clicking a different block remounts cleanly.
 */
export function TaskDetailDialogHost({ task, onClose }: { task: Task; onClose: () => void }) {
  const ref = React.useRef<TaskEditorHandle>(null)

  React.useEffect(() => {
    ref.current?.open('view')
  }, [])

  return <TaskEditorDialog ref={ref} mode="edit" task={task} onClose={onClose} />
}
