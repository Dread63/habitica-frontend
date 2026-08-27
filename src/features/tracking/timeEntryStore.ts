import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  closeStrayOpenEntries,
  deleteEntry,
  editEntry,
  handleTaskDeleted,
  splitEntry,
  startTracking,
  stopTracking,
  type TimeEntryClosedBy,
  type TimeEntryEdit,
  type TimeEntrySource,
  type TimeEntryState,
  type TimeEntryTaskRef,
} from './timeEntries'

interface TimeEntryStore extends TimeEntryState {
  /** Open an interval, closing any current one at the same instant. The only
   * opener — see startTracking for why the invariant lives in the reducer. */
  start: (task: TimeEntryTaskRef, options?: { source?: TimeEntrySource; phaseId?: string }) => void
  stop: (closedBy?: TimeEntryClosedBy) => void
  /** Close at a specific instant rather than now — a phase end detected late
   * must close at the phase's real end, not when the tick noticed. */
  stopAt: (at: Date, closedBy: TimeEntryClosedBy) => void
  edit: (entryId: string, edit: TimeEntryEdit) => void
  split: (entryId: string, at: Date) => void
  remove: (entryId: string) => void
  /** Task deleted — stops the pointer, KEEPS the history. Deliberately not a
   * cascade; see handleTaskDeleted. */
  onTaskDeleted: (taskId: string) => void
  /** Replace local state with the result of a server merge (lib/sync). */
  applySyncedState: (state: TimeEntryState) => void
}

/**
 * v1 has nothing to migrate, but the function must exist anyway: zustand's
 * persist **discards stored state entirely** when the version changes and no
 * `migrate` is supplied — it only console.errors. Every future bump lands
 * here, and this is where `closeStrayOpenEntries` runs, so a state that
 * somehow acquired two open entries is normalised on load rather than
 * rendering a pointer that fights itself.
 *
 * Exported and named so the riskiest code in the feature is a plain unit test
 * rather than something only reachable through zustand's internals.
 */
export function migrateTimeEntryState(persisted: unknown, _version: number, now: Date = new Date()): TimeEntryState {
  const prior = persisted as Partial<TimeEntryState> | undefined
  return closeStrayOpenEntries(
    {
      entries: Array.isArray(prior?.entries) ? prior.entries : [],
      tombstones: prior?.tombstones ?? {},
    },
    now,
  )
}

/**
 * The time ledger. Separate from pomodoroStore on purpose: the pointer must
 * work with no timer running at all, `useFocusSync` subscribes per-slice, and
 * persist versioning is per-store so this can start clean at v1 while the
 * pomodoro store takes its own bumps.
 *
 * Every action is a one-line delegation to a pure reducer in timeEntries.ts —
 * deliberately, so the whole state machine is testable without React, zustand
 * or a fake clock beyond an injected `now`.
 */
export const useTimeEntryStore = create<TimeEntryStore>()(
  persist(
    (set) => ({
      entries: [],
      tombstones: {},

      start: (task, options) =>
        set((state) =>
          startTracking(state, { task, source: options?.source ?? 'manual', phaseId: options?.phaseId }, new Date()),
        ),

      stop: (closedBy = 'user') => set((state) => stopTracking(state, new Date(), closedBy)),

      stopAt: (at, closedBy) => set((state) => stopTracking(state, at, closedBy)),

      edit: (entryId, edit) => set((state) => editEntry(state, entryId, edit, new Date())),

      split: (entryId, at) => set((state) => splitEntry(state, entryId, at, new Date())),

      remove: (entryId) => set((state) => deleteEntry(state, entryId, new Date())),

      onTaskDeleted: (taskId) => set((state) => handleTaskDeleted(state, taskId, new Date())),

      applySyncedState: (next) => set(closeStrayOpenEntries(next, new Date())),
    }),
    {
      name: 'habitica-frontend:time-entries',
      version: 1,
      partialize: (state): TimeEntryState => ({ entries: state.entries, tombstones: state.tombstones }),
      migrate: (persisted, version) => migrateTimeEntryState(persisted, version),
    },
  ),
)
