import * as React from 'react'
import { Dialog, type DialogHandle } from './dialog'
import { Button } from './button'
import { Input } from './input'
import { usePromptStore } from './promptStore'

/** Same pattern as ConfirmDialogHost — mounted once in App.tsx, driven by the store. */
export function PromptDialogHost() {
  const request = usePromptStore((s) => s.request)
  const resolve = usePromptStore((s) => s.resolve)
  const dialogRef = React.useRef<DialogHandle>(null)
  const [value, setValue] = React.useState('')

  React.useEffect(() => {
    if (request) {
      setValue(request.defaultValue)
      dialogRef.current?.open()
    } else {
      dialogRef.current?.close()
    }
  }, [request])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    resolve(value)
  }

  return (
    <Dialog ref={dialogRef} title={request?.title ?? 'Enter a value'} onClose={() => resolve(null)}>
      {request && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {request.label && (
            <label className="text-xs font-medium text-muted-foreground">{request.label}</label>
          )}
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => resolve(null)}>
              {request.cancelLabel}
            </Button>
            <Button type="submit">{request.confirmLabel}</Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
