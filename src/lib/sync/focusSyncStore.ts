import { create } from 'zustand'

export type SyncStatus = 'unknown' | 'unavailable' | 'idle' | 'syncing' | 'offline' | 'error'

interface FocusSyncState {
  status: SyncStatus
  lastSyncedAt: number | null
  lastError: string | null
  /** Bumped by every store mutation worth pushing; the sync loop watches it
   * so a change schedules a push instead of waiting for the next poll. */
  pendingRevision: number
}

interface FocusSyncStore extends FocusSyncState {
  markChanged: () => void
  setStatus: (status: SyncStatus, error?: string | null) => void
  markSynced: () => void
}

/**
 * Sync status, kept out of the data stores on purpose.
 *
 * If this lived in timelineEntryStore, every status flicker ("syncing" ->
 * "idle") would notify every component subscribed to the timeline and
 * re-render the scrubber. Separating them means the status pill re-renders
 * and nothing else does.
 */
export const useFocusSyncStore = create<FocusSyncStore>()((set) => ({
  status: 'unknown',
  lastSyncedAt: null,
  lastError: null,
  pendingRevision: 0,

  markChanged: () => set((state) => ({ pendingRevision: state.pendingRevision + 1 })),
  setStatus: (status, error = null) => set({ status, lastError: error }),
  markSynced: () => set({ status: 'idle', lastSyncedAt: Date.now(), lastError: null }),
}))
