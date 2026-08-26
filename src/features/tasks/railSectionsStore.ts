import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type RailType = 'habit' | 'daily' | 'reward'

interface RailSectionsState {
  collapsed: Record<RailType, boolean>
  toggleSection: (type: RailType) => void
}

/**
 * Habits/Dailies/Rewards live in a narrow left rail next to the tag filter
 * (Dashboard.tsx) instead of their own full-width columns — freeing To-Dos
 * (the list that actually grows long) to take the wide main area. Explicit
 * per-section collapse is the scaling answer for someone with a lot of
 * habits/dailies (raised directly during design: ~10 habits + 5 dailies is
 * already enough that an always-expanded rail gets unwieldy) — collapsing
 * "Dailies" once they're all done for the day, for instance. Persisted the
 * same way tagFilterStore persists filter state, so a collapsed section
 * stays collapsed across reloads.
 */
export const useRailSectionsStore = create<RailSectionsState>()(
  persist(
    (set) => ({
      collapsed: { habit: false, daily: false, reward: false },
      toggleSection: (type) => set((state) => ({ collapsed: { ...state.collapsed, [type]: !state.collapsed[type] } })),
    }),
    { name: 'habitica-frontend:rail-sections' },
  ),
)
