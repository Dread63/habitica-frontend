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
  children: React.ReactNode
  /** Fires on the native `close` event — Esc, `.close()`, backdrop click, or a
   * `<form method="dialog">` submission all funnel through this one event. */
  onClose?: () => void
}

/**
 * Built on the native <dialog> element rather than a Radix dependency —
 * modern browsers give focus trapping, Esc-to-close, and the top-layer
 * backdrop for free. Two preflight gotchas worth knowing if this needs
 * touching later: Tailwind's `margin: 0` reset defeats <dialog>'s native
 * auto-centering (fixed + translate below replaces it), and the `backdrop:`
 * variant (Tailwind v3.4+/v4) targets `::backdrop`, not a real DOM node.
 */
export const Dialog = React.forwardRef<DialogHandle, DialogProps>(
  ({ title, children, onClose }, ref) => {
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
          'fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-border bg-card p-0 text-card-foreground shadow-lg',
          'backdrop:bg-black/50',
        )}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-sm font-semibold">{title}</h2>
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
          <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        </div>
      </dialog>
    )
  },
)
Dialog.displayName = 'Dialog'
