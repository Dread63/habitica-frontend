import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  EMPTY_TAG_FILTER,
  cycleTagInFilter,
  removeTagFromFilter,
  type TagFilterMode,
  type TagFilterState,
} from './tagFilter'

export interface TagFilterPreset {
  id: string
  name: string
  filter: TagFilterState
}

interface TagFilterStoreState {
  filter: TagFilterState
  presets: TagFilterPreset[]
}

interface TagFilterStore extends TagFilterStoreState {
  /** neutral -> included -> excluded -> neutral, see tagFilter.ts */
  cycleTag: (tagId: string) => void
  setMode: (mode: TagFilterMode) => void
  clearFilter: () => void
  /** Called when a tag is deleted — drops it from the active filter and every saved preset. */
  pruneTag: (tagId: string) => void
  savePreset: (name: string) => void
  applyPreset: (id: string) => void
  deletePreset: (id: string) => void
}

const STORE_VERSION = 1

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

      setMode: (mode) => set((state) => ({ filter: { ...state.filter, mode } })),

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
    {
      name: 'habitica-frontend:tag-filter',
      version: STORE_VERSION,
      partialize: (state): TagFilterStoreState => ({ filter: state.filter, presets: state.presets }),
      // The filter model changed shape mid-Phase-3 (anyOf/allOf/noneOf per-tag
      // buckets -> one included[] list + a single mode + excluded[]) — see
      // tagFilter.ts. There's no reasonable lossless migration from the old
      // per-tag-bucket model to the new single-mode one, and this is
      // pre-release local state, so a version mismatch just resets to fresh
      // defaults instead of crashing on the old shape.
      migrate: (): TagFilterStoreState => ({ filter: EMPTY_TAG_FILTER, presets: [] }),
    },
  ),
)
