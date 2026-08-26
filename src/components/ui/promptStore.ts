import { create } from 'zustand'

export interface PromptOptions {
  title?: string
  /** Field label — omit for a bare input with no extra context line. */
  label?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
}

interface PromptRequest extends Required<Omit<PromptOptions, 'label'>> {
  label?: string
  resolve: (value: string | null) => void
}

interface PromptStoreState {
  request: PromptRequest | null
  ask: (options: PromptOptions) => Promise<string | null>
  resolve: (value: string | null) => void
}

/**
 * Same pattern as confirmStore.ts — one dialog instance at the app root
 * (PromptDialogHost, mounted in App.tsx) standing in for `window.prompt`,
 * so tag rename and "save this filter" naming match the app's own theme
 * instead of a native browser prompt box.
 */
export const usePromptStore = create<PromptStoreState>((set, get) => ({
  request: null,
  ask: (options) =>
    new Promise<string | null>((resolve) => {
      set({
        request: {
          title: options.title ?? 'Enter a value',
          label: options.label,
          defaultValue: options.defaultValue ?? '',
          confirmLabel: options.confirmLabel ?? 'Save',
          cancelLabel: options.cancelLabel ?? 'Cancel',
          resolve,
        },
      })
    }),
  resolve: (value) => {
    get().request?.resolve(value)
    set({ request: null })
  },
}))

/** Drop-in async replacement for `window.prompt(message, default)` — `await` it. Resolves
 * `null` on cancel/Esc/backdrop-click, same as the native dialog. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  return usePromptStore.getState().ask(options)
}
