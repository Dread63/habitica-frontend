import * as React from 'react'
import type { Task } from '@/lib/habitica/types'
import { ScheduleFields } from './ScheduleFields'

const POPOVER_WIDTH = 288 // w-72
const POPOVER_HEIGHT = 220 // estimate for clamping; the date picker's calendar overflows below when open

interface SchedulePopoverProps {
  x: number
  y: number
  task: Task
  initialDate?: string
  onClose: () => void
}

/**
 * ScheduleFields in a fixed-position popover pinned near an anchor point (a
 * button rect, a right-click, a timeline block) — same hand-rolled shape as
 * TodoBoard's LaterDatePopover: viewport-clamped, closes on outside
 * pointerdown or Escape. Deliberately not a shared components/ui primitive;
 * each floating UI in this codebase hand-rolls this small chrome per site.
 */
export function SchedulePopover({ x, y, task, initialDate, onClose }: SchedulePopoverProps) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const left = Math.min(Math.max(x - POPOVER_WIDTH / 2, 8), window.innerWidth - POPOVER_WIDTH - 8)
  const top = Math.min(y, window.innerHeight - POPOVER_HEIGHT - 8)

  return (
    <div
      ref={ref}
      className="fixed z-30 w-72 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg"
      style={{ left, top }}
    >
      <p className="mb-2 truncate text-xs font-medium text-muted-foreground" title={task.text}>
        {task.text}
      </p>
      <ScheduleFields task={task} initialDate={initialDate} autoFocusTime onDone={onClose} />
    </div>
  )
}
