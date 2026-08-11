import * as React from 'react'
import { Dialog, type DialogHandle } from './dialog'
import { Button } from './button'
import { useConfirmStore } from './confirmStore'

/**
 * Mounted once in App.tsx. Reacts to the store rather than being opened via
 * a ref, since — unlike every other dialog in the app — any component
 * anywhere can trigger this one via `confirmDialog()` without holding a ref
 * to it.
 */
export function ConfirmDialogHost() {
  const request = useConfirmStore((s) => s.request)
  const resolve = useConfirmStore((s) => s.resolve)
  const dialogRef = React.useRef<DialogHandle>(null)

  React.useEffect(() => {
    if (request) dialogRef.current?.open()
    else dialogRef.current?.close()
  }, [request])

  return (
    // onClose covers Esc/backdrop-click — same as clicking Cancel.
    <Dialog ref={dialogRef} title={request?.title ?? 'Are you sure?'} onClose={() => resolve(false)}>
      {request && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">{request.message}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => resolve(false)}>
              {request.cancelLabel}
            </Button>
            <Button
              type="button"
              variant={request.destructive ? 'destructive' : 'default'}
              onClick={() => resolve(true)}
              autoFocus
            >
              {request.confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
