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
}

/**
 * All timeline placements, every date, one flat array — local-only state
 * (Habitica has no concept of this), joined against live task data by
 * taskId at render time. Same Zustand-over-Context reasoning as
 * tagFilterStore: several update actions + persist middleware.
 */
export const useTimelineEntryStore = create<TimelineEntryStore>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (taskId, date, startMinutes, durationMinutes, taskSnapshot) =>
        set((state) => ({
          entries: [
            ...state.entries,
            createTimelineEntry({ taskId, date, startMinutes, durationMinutes, taskSnapshot }),
          ],
        })),

      moveEntry: (entryId, newStartMinutes) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === entryId ? moveEntry(e, newStartMinutes) : e)),
        })),

      resizeEntry: (entryId, newDurationMinutes) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === entryId ? resizeEntry(e, newDurationMinutes) : e)),
        })),

      rescheduleEntry: (entryId, date, startMinutes, durationMinutes) =>
        set((state) => {
          const target = state.entries.find((e) => e.id === entryId)
          if (!target) return state
          const moved = rescheduleEntry(target, date, startMinutes, durationMinutes)
          return {
            entries: state.entries
              .filter((e) => e.id === entryId || !(e.taskId === moved.taskId && e.date === moved.date))
              .map((e) => (e.id === entryId ? moved : e)),
          }
        }),

      removeEntry: (entryId) => set((state) => ({ entries: state.entries.filter((e) => e.id !== entryId) })),

      // syncTaskSnapshots returns the same array reference when nothing
      // changed, so a no-op sync doesn't notify subscribers — important,
      // since this runs from an effect on every tasks query settle.
      syncSnapshots: (snapshots) => set((state) => ({ entries: syncTaskSnapshots(state.entries, snapshots) })),

      pruneTask: (taskId) => set((state) => ({ entries: removeEntriesForTask(state.entries, taskId) })),
    }),
    {
      name: 'habitica-frontend:timeline-entries',
      version: 2,
      partialize: (state): TimelineEntryStoreState => ({ entries: state.entries }),
      /**
       * v2 added the optional TimelineEntry.taskSnapshot, so v1 entries are
       * already valid v2 entries — the first syncSnapshots pass fills the
       * field in from live task data. This is therefore an identity
       * migration, and it has to exist anyway: zustand's persist *discards*
       * stored state entirely when the version changes and no `migrate` is
       * provided (it only console.errors), which would have quietly wiped
       * every timeline placement the user had made.
       */
      migrate: (persisted) => ({ entries: (persisted as Partial<TimelineEntryStoreState>).entries ?? [] }),
    },
  ),
)
