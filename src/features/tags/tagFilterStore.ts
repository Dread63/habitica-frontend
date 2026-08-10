import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EMPTY_TAG_FILTER, cycleTagInFilter, removeTagFromFilter, type TagFilterState } from './tagFilter'

export interface TagFilterPreset {
  id: string
  name: string
  filter: TagFilterState
}

interface TagFilterStore {
  filter: TagFilterState
  presets: TagFilterPreset[]
  /** neutral -> anyOf -> allOf -> noneOf -> neutral, see tagFilter.ts */
  cycleTag: (tagId: string) => void
  clearFilter: () => void
  /** Called when a tag is deleted — drops it from the active filter and every saved preset. */
  pruneTag: (tagId: string) => void
  savePreset: (name: string) => void
  applyPreset: (id: string) => void
  deletePreset: (id: string) => void
}

/**
 * The one piece of state in this app that genuinely warranted Zustand over
 * plain React Context (unlike ThemeProvider/AuthProvider) — several related
 * fields, several update actions, and `persist` middleware handles the
 * localStorage round-trip for both `filter` and `presets` without hand-
 * rolling it the way ThemeProvider does.
 */
export const useTagFilterStore = create<TagFilterStore>()(
  persist(
    (set, get) => ({
      filter: EMPTY_TAG_FILTER,
      presets: [],

      cycleTag: (tagId) => set((state) => ({ filter: cycleTagInFilter(state.filter, tagId) })),

      clearFilter: () => set({ filter: EMPTY_TAG_FILTER }),

      pruneTag: (tagId) =>
        set((state) => ({
          filter: removeTagFromFilter(state.filter, tagId),
          presets: state.presets.map((preset) => ({
            ...preset,
            filter: removeTagFromFilter(preset.filter, tagId),
          })),
        })),

      savePreset: (name) => {
        const preset: TagFilterPreset = { id: crypto.randomUUID(), name, filter: get().filter }
        set((state) => ({ presets: [...state.presets, preset] }))
      },

      applyPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id)
        if (preset) set({ filter: preset.filter })
      },

      deletePreset: (id) => set((state) => ({ presets: state.presets.filter((p) => p.id !== id) })),
    }),
    { name: 'habitica-frontend:tag-filter' },
  ),
)
