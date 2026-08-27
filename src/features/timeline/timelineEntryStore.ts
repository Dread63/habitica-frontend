import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createTimelineEntry,
  moveEntry,
  removeEntriesForTask,
  rescheduleEntry,
  resizeEntry,
  syncTaskSnapshots,
  type TimelineEntry,
  type TimelineTaskSnapshot,
} from './timelineEntries'

interface TimelineEntryStoreState {
  entries: TimelineEntry[]
  /**
   * entryId -> ms epoch of its deletion. Deleting has to leave a trace or a
   * device that was offline at the time would push its still-live copy back
   * on reconnect and resurrect the block. Kept *beside* `entries` rather than
   * as a `deleted` flag on the entries themselves so that every read path
   * (entriesForDate, entryForTaskOnDate, the lane packer…) stays unchanged
   * and can't accidentally render a deleted placement.
   */
  tombstones: Record<string, number>
}

interface TimelineEntryStore extends TimelineEntryStoreState {
  addEntry: (
    taskId: string,
    date: string,
    startMinutes: number,
    durationMinutes: number,
    taskSnapshot?: TimelineTaskSnapshot,
  ) => void
  moveEntry: (entryId: string, newStartMinutes: number) => void
  resizeEntry: (entryId: string, newDurationMinutes: number) => void
  /**
   * Move a placement to another day (and time) without creating a second
   * one. Also enforces the one-placement-per-task-per-date invariant that
   * `entryForTaskOnDate` and the unscheduled rail both assume, by dropping
   * any *other* placement of the same task already sitting on the target day.
   */
  rescheduleEntry: (entryId: string, date: string, startMinutes: number, durationMinutes: number) => void
  removeEntry: (entryId: string) => void
  /** Refresh every entry's cached task title/type/tags from the live task
   * list — see TimelineEntry.taskSnapshot for why entries carry one at all.
   * Driven by useTimelineSnapshotSync, mounted once in the authed shell. */
  syncSnapshots: (snapshots: ReadonlyMap<string, TimelineTaskSnapshot>) => void
  /** Called when a task is deleted — mirrors tagFilterStore.pruneTag's
   * cascade-on-delete convention (wired into useDeleteTask). */
  pruneTask: (taskId: string) => void
  /** Replace local state with the result of a server merge (lib/sync). */
  applySyncedState: (state: TimelineEntryStoreState) => void
}

/** Every write goes through here, so `updatedAt` can't be forgotten. */
function touch(entry: TimelineEntry): TimelineEntry {
  return { ...entry, updatedAt: Date.now() }
}

/**
 * All timeline placements, every date, one flat array — joined against live
 * task data by taskId at render time. Mirrored to the NAS by lib/sync when a
 * server is configured; localStorage remains the working copy either way, so
 * the app keeps functioning with no server at all.
 */
export const useTimelineEntryStore = create<TimelineEntryStore>()(
  persist(
    (set) => ({
      entries: [],
      tombstones: {},

      addEntry: (taskId, date, startMinutes, durationMinutes, taskSnapshot) =>
        set((state) => ({
          entries: [
            ...state.entries,
            createTimelineEntry({ taskId, date, startMinutes, durationMinutes, taskSnapshot }),
          ],
        })),

      moveEntry: (entryId, newStartMinutes) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === entryId ? touch(moveEntry(e, newStartMinutes)) : e)),
        })),

      resizeEntry: (entryId, newDurationMinutes) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === entryId ? touch(resizeEntry(e, newDurationMinutes)) : e)),
        })),

      rescheduleEntry: (entryId, date, startMinutes, durationMinutes) =>
        set((state) => {
          const target = state.entries.find((e) => e.id === entryId)
          if (!target) return state
          const moved = touch(rescheduleEntry(target, date, startMinutes, durationMinutes))
          const displaced = state.entries.filter(
            (e) => e.id !== entryId && e.taskId === moved.taskId && e.date === moved.date,
          )
          return {
            entries: state.entries
              .filter((e) => !displaced.some((d) => d.id === e.id))
              .map((e) => (e.id === entryId ? moved : e)),
            tombstones: { ...state.tombstones, ...Object.fromEntries(displaced.map((d) => [d.id, Date.now()])) },
          }
        }),

      removeEntry: (entryId) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== entryId),
          tombstones: { ...state.tombstones, [entryId]: Date.now() },
        })),

      // syncTaskSnapshots returns the same array reference when nothing
      // changed, so a no-op sync doesn't notify subscribers — important,
      // since this runs from an effect on every tasks query settle.
      syncSnapshots: (snapshots) =>
        set((state) => {
          const next = syncTaskSnapshots(state.entries, snapshots)
          if (next === state.entries) return state
          // Only the entries syncTaskSnapshots actually rewrote get a new
          // timestamp; untouched ones keep theirs and stay quiet on the wire.
          return {
            entries: next.map((e, i) => (e === state.entries[i] ? e : touch(e))),
          }
        }),

      pruneTask: (taskId) =>
        set((state) => {
          const removed = state.entries.filter((e) => e.taskId === taskId)
          if (removed.length === 0) return state
          return {
            entries: removeEntriesForTask(state.entries, taskId),
            tombstones: { ...state.tombstones, ...Object.fromEntries(removed.map((e) => [e.id, Date.now()])) },
          }
        }),

      applySyncedState: (next) => set(next),
    }),
    {
      name: 'habitica-frontend:timeline-entries',
      version: 3,
      partialize: (state): TimelineEntryStoreState => ({
        entries: state.entries,
        tombstones: state.tombstones,
      }),
      /**
       * v2 added TimelineEntry.taskSnapshot; v3 added `updatedAt` per entry
       * and the `tombstones` map, both needed for cross-device sync.
       *
       * An explicit migrate has to exist even when it looks like a no-op:
       * zustand's persist *discards* stored state entirely when the version
       * changes and no `migrate` is given (it only console.errors), which
       * would wipe every timeline placement the user had made. Entries with
       * no `updatedAt` get 0 — the lowest possible precedence, so a device
       * that has actually synced always wins over a stale local copy.
       */
      migrate: (persisted) => {
        const prior = persisted as Partial<TimelineEntryStoreState> | undefined
        return {
          entries: (prior?.entries ?? []).map((entry) => ({ ...entry, updatedAt: entry.updatedAt ?? 0 })),
          tombstones: prior?.tombstones ?? {},
        }
      },
    },
  ),
)
