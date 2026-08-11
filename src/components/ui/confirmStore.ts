import { create } from 'zustand'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Renders the confirm button in the destructive (red) variant — for delete-style actions. */
  destructive?: boolean
}

interface ConfirmRequest extends Required<Omit<ConfirmOptions, 'destructive'>> {
  destructive: boolean
  resolve: (confirmed: boolean) => void
}

interface ConfirmStoreState {
  request: ConfirmRequest | null
  ask: (options: ConfirmOptions) => Promise<boolean>
  resolve: (confirmed: boolean) => void
}

/**
 * Backs `confirmDialog()` below — a single dialog instance mounted once at
 * the app root (see ConfirmDialogHost, added to App.tsx) rather than one
 * per call site, the same way `window.confirm` is a single browser-owned
 * dialog. This replaces the `window.confirm` placeholders scattered through
 * TaskCard/TagManagerDialog (see CLAUDE.md's "deliberate placeholder" notes
 * on those) with something that actually matches the rest of the app's
 * theme/animation instead of a native browser alert box.
 */
export const useConfirmStore = create<ConfirmStoreState>((set, get) => ({
  request: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      set({
        request: {
          title: options.title ?? 'Are you sure?',
          message: options.message,
          confirmLabel: options.confirmLabel ?? 'Confirm',
          cancelLabel: options.cancelLabel ?? 'Cancel',
          destructive: options.destructive ?? false,
          resolve,
        },
      })
    }),
  resolve: (confirmed) => {
    get().request?.resolve(confirmed)
    set({ request: null })
  },
}))

/** Drop-in async replacement for `window.confirm(message)` — `await` it. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options)
}
