import * as React from 'react'
import { shouldSuppressDrag } from './dragGuard'

export interface DragGuard {
  /**
   * Whether the source should currently be draggable. Callers with their own
   * condition AND it: `draggable={drag.draggable && !isResizing}`.
   */
  draggable: boolean
  /** Spread onto the drag source. Capture phase, so it sees presses that
   * descendants will go on to handle themselves. */
  onPointerDownCapture: (event: React.PointerEvent<HTMLElement>) => void
  /** Wrap the source's own `onDragStart` so it cannot run for a guarded
   * press. Explicit rather than a second capture-phase listener that relies on
   * `stopPropagation` ordering to cancel the wrapped handler. */
  guardDragStart: <E extends Element>(
    handler: (event: React.DragEvent<E>) => void,
  ) => (event: React.DragEvent<E>) => void
}

/**
 * Makes a native HTML5 drag source yield to interactive descendants — a notes
 * textarea, a subtask input, a hover button. See `dragGuard.ts` for the bug
 * this exists for and for why portalling the editor is not the fix.
 *
 * Belt **and** braces, deliberately:
 *
 * - The **attribute flip** is what actually fixes the reported bug. Browsers
 *   read `draggable` when the drag gesture is recognised, after the pointer has
 *   moved past a threshold — late enough for React to have re-rendered. Only
 *   clearing the attribute restores caret placement and text selection inside
 *   the control; cancelling `dragstart` afterwards does not.
 * - The **ref check inside `guardDragStart`** closes the re-render race in the
 *   pathological case where a drag is recognised before the state lands. A ref
 *   written during the capture phase cannot be stale by `dragstart`.
 *
 * The release listener is on `window`, not on the element: a text selection
 * that starts inside the card frequently ends with the pointer outside it, and
 * an element-level `pointerup` would then never fire — leaving the source
 * permanently undraggable.
 */
export function useDragGuard(): DragGuard {
  const [suppressed, setSuppressed] = React.useState(false)
  const suppressedRef = React.useRef(false)

  React.useEffect(() => {
    if (!suppressed) return
    const release = () => {
      suppressedRef.current = false
      setSuppressed(false)
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [suppressed])

  const onPointerDownCapture = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const next = shouldSuppressDrag(event.target, event.currentTarget)
    suppressedRef.current = next
    // Only re-render when the answer changed — this runs on every press
    // anywhere in a card, and most of them change nothing.
    setSuppressed((prev) => (prev === next ? prev : next))
  }, [])

  const guardDragStart = React.useCallback(
    <E extends Element>(handler: (event: React.DragEvent<E>) => void) =>
      (event: React.DragEvent<E>) => {
        if (suppressedRef.current) {
          event.preventDefault()
          return
        }
        handler(event)
      },
    [],
  )

  return { draggable: !suppressed, onPointerDownCapture, guardDragStart }
}
