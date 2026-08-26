import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface DialogHandle {
  open: () => void
  close: () => void
}

interface DialogProps {
  title: string
  /** Optional leading icon next to the title — e.g. TaskEditorDialog's
   * per-type icon (see taskType.ts). Purely decorative, so it's on the
   * caller to keep it meaningful; the heading itself carries the text. */
  icon?: React.ReactNode
  children: React.ReactNode
  /** Fires on the native `close` event — Esc, `.close()`, backdrop click, or a
   * `<form method="dialog">` submission all funnel through this one event. */
  onClose?: () => void
  /**
   * 'default' (max-w-md) fits every dialog except the task detail view,
   * which was explicitly asked to use more of the screen for its markdown
   * — 'lg' (max-w-2xl, taller body cap) opts into that without changing
   * every other dialog (confirm/prompt, tag manager, the create/edit form)
   * that's fine staying compact.
   */
  size?: 'default' | 'lg'
}

/**
 * Built on the native <dialog> element rather than a Radix dependency —
 * modern browsers give focus trapping, Esc-to-close, and the top-layer
 * backdrop for free. Two preflight gotchas worth knowing if this needs
 * touching later: Tailwind's `margin: 0` reset defeats <dialog>'s native
 * auto-centering (fixed positioning + the `.app-dialog` transform in
 * index.css replaces it — that same rule also drives the open/close
 * animation, see its comment), and the `backdrop:` variant (Tailwind
 * v3.4+/v4) targets `::backdrop`, not a real DOM node.
 */
export const Dialog = React.forwardRef<DialogHandle, DialogProps>(
  ({ title, icon, children, onClose, size = 'default' }, ref) => {
    const dialogRef = React.useRef<HTMLDialogElement>(null)

    React.useImperativeHandle(ref, () => ({
      open: () => dialogRef.current?.showModal(),
      close: () => dialogRef.current?.close(),
    }))

    return (
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={(event) => {
          // A click landing on the <dialog> element itself (not its content,
          // which stops propagation via the wrapping div below) is a backdrop click.
          if (event.target === dialogRef.current) dialogRef.current?.close()
        }}
        className={cn(
          // Positioning only here — centering is folded into the app-dialog
          // transform below (it also carries the open/close scale), and
          // .app-dialog's transition/@starting-style rules in index.css
          // drive the animation. See that rule's comment for why this is
          // plain CSS rather than Tailwind's `open:`/`starting:` variants.
          'app-dialog fixed top-1/2 left-1/2 w-[calc(100%-2rem)]',
          size === 'lg' ? 'max-w-2xl' : 'max-w-md',
          'rounded-lg border border-border bg-card p-0 text-card-foreground shadow-lg',
          'backdrop:bg-black/50',
        )}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              {icon}
              {title}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className={cn('overflow-y-auto p-4', size === 'lg' ? 'max-h-[85vh]' : 'max-h-[70vh]')}>{children}</div>
        </div>
      </dialog>
    )
  },
)
Dialog.displayName = 'Dialog'
