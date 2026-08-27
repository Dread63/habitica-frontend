import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface HeartbeatState {
  /** ms epoch of the last moment this browser tab was known to be alive. */
  lastSeenAt: number
}

interface HeartbeatStore extends HeartbeatState {
  beat: () => void
}

/**
 * "This device was awake at T." Written on a plain interval by
 * TrackingReconciliationHost and read by the idle prompt to propose a
 * sensible end time for an entry that outran the user.
 *
 * **Device-local and deliberately never synced.** It describes one browser on
 * one machine; merging it across devices would make a phone that was awake
 * vouch for a laptop that was asleep, which is precisely backwards.
 *
 * Its own store, for the same reason focusSyncStore is separate: a write
 * every 30 seconds into timeEntryStore would re-render every timeline and
 * stats subscriber, and is one careless `partialize` away from scheduling a
 * sync push twice a minute forever.
 */
export const useHeartbeatStore = create<HeartbeatStore>()(
  persist(
    (set) => ({
      lastSeenAt: Date.now(),
      beat: () => set({ lastSeenAt: Date.now() }),
    }),
    {
      name: 'habitica-frontend:heartbeat',
      version: 1,
      partialize: (state): HeartbeatState => ({ lastSeenAt: state.lastSeenAt }),
      // Present because zustand discards stored state on a version bump
      // without one. A missing value defaults to "now", which makes the very
      // first load propose nothing rather than flagging every old entry.
      migrate: (persisted) => {
        const prior = persisted as Partial<HeartbeatState> | undefined
        return { lastSeenAt: typeof prior?.lastSeenAt === 'number' ? prior.lastSeenAt : Date.now() }
      },
    },
  ),
)
