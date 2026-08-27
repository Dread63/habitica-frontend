import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { randomId } from '@/lib/randomId'
import { toDateOnlyString } from '@/lib/dateOnly'
import type { TaskType } from '@/lib/habitica/types'
import { minutesFromDate } from '@/lib/timeOfDay'
import { entriesForDate, focusCandidateEntries } from '@/features/timeline/timelineEntries'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import {
  advancePhase,
  closeSegments,
  defaultPomodoroSettings,
  IDLE_RUN_STATE,
  type CompletedPhase,
  type PomodoroRunState,
  type PomodoroSettings,
} from './pomodoroEngine'
import { createPhaseRecord, type PomodoroPhaseRecord } from './pomodoroPhases'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { openEntryOf, type TimeEntryTaskRef } from '@/features/tracking/timeEntries'

interface PomodoroStoreState {
  settings: PomodoroSettings
  run: PomodoroRunState
  /**
   * The phase log — what the timer did, as opposed to where the time went
   * (features/tracking). Append-only; nothing edits a phase record.
   */
  phases: PomodoroPhaseRecord[]
  /**
   * ms epoch of the last settings change — the conflict rule when two
   * devices both edited them (see lib/sync/mergeState.ts). Only `settings`
   * and `phases` sync; `run` is deliberately device-local, because a live
   * countdown belongs to the machine you started it on and syncing it would
   * mean two devices fighting over one clock.
   */
  settingsUpdatedAt: number
}

interface PomodoroStore extends PomodoroStoreState {
  updateSettings: (patch: Partial<PomodoroSettings>) => void
  toggleTrackedTag: (tagId: string) => void
  /** Called when a tag is deleted — mirrors tagFilterStore.pruneTag (wired
   * into useDeleteTag). Time entries keep their tag *snapshots*; category
   * aggregation is a live intersection, so no ledger cleanup is needed. */
  pruneTrackedTag: (tagId: string) => void
  /**
   * Starts a fresh focus cycle. Pass a task to point at, or omit it to let
   * the store infer one (whatever is already tracked, else the timeline's
   * suggestion). Null means the phase runs with nothing tracked.
   */
  startSession: (task?: TimeEntryTaskRef | null) => void
  pauseSession: () => void
  resumeSession: () => void
  /** Leaves the `awaiting` seam — starts the break (or the next focus block)
   * the user was just offered. The timer never does this on its own. */
  startNextPhase: () => void
  /** Manual stop. A partially-elapsed work phase is logged with its actual
   * minutes (completedNaturally: false) — honest time-tracking over
   * pomodoro purism; partially-elapsed breaks are just discarded. */
  stopSession: () => void
  /**
   * Recomputes `run` against the real clock, appending a newly-completed
   * phase to the phase log and returning it so the caller can chime/notify.
   * Called from PomodoroStatusPill (1s tick while running + visibilitychange
   * + mount) — the store itself never registers listeners or plays sounds,
   * matching this codebase's convention of effects living in components.
   */
  advance: () => CompletedPhase | null
  /** Replace the synced half of the store from a server merge (lib/sync). */
  applySyncedState: (state: {
    phases: PomodoroPhaseRecord[]
    settings: PomodoroSettings
    settingsUpdatedAt: number
  }) => void
}

/**
 * The task the timeline suggests for a focus phase starting *now* — whatever
 * is scheduled over this moment, or the next upcoming block, minus anything
 * already completed (`focusCandidateEntries`).
 *
 * Lives in the store rather than the panel because the panel is mounted twice
 * at once on the Timeline page (the rail and the dialog's Timer tab), so an
 * effect there would fire twice. Identity comes from each entry's snapshot —
 * the store has no query cache — which `useTimelineSnapshotSync` keeps current.
 */
export function suggestedTaskRef(now: Date, windowMinutes: number): TimeEntryTaskRef | null {
  const dayEntries = entriesForDate(useTimelineEntryStore.getState().entries, toDateOnlyString(now))
  for (const entry of focusCandidateEntries(dayEntries, minutesFromDate(now), windowMinutes)) {
    const snapshot = entry.taskSnapshot
    if (snapshot) return { id: entry.taskId, text: snapshot.text, type: snapshot.type, tagIds: snapshot.tagIds }
  }
  return null
}

function refOf(entry: { taskId: string; taskSnapshot: { text: string; type: TaskType; tagIds: string[] } }): TimeEntryTaskRef {
  return { id: entry.taskId, text: entry.taskSnapshot.text, type: entry.taskSnapshot.type, tagIds: entry.taskSnapshot.tagIds }
}

/**
 * The task a focus phase should point at when the caller didn't name one, in
 * order of confidence:
 *
 *  1. whatever is already being tracked — switching phases shouldn't change
 *     what you're doing;
 *  2. the last thing tracked *within this phase*, which is what makes
 *     resuming from a pause continue the same work rather than guessing
 *     afresh (a pause closes the entry, so there is nothing open to read);
 *  3. the timeline's suggestion for right now.
 *
 * Null means the phase runs untracked and the panel says "Not tracking" —
 * deliberately not a guess.
 */
function inferPointerTask(now: Date, windowMinutes: number, phaseId?: string | null): TimeEntryTaskRef | null {
  const entries = useTimeEntryStore.getState().entries
  const open = openEntryOf(entries)
  if (open) return refOf(open)

  if (phaseId) {
    const withinPhase = entries.filter((e) => e.phaseId === phaseId)
    const last = withinPhase[withinPhase.length - 1]
    if (last) return refOf(last)
  }
  return suggestedTaskRef(now, windowMinutes)
}

/**
 * Opens a time entry for a focus phase. Called from the store rather than a
 * component so it happens once per state transition — PomodoroPanel is
 * mounted twice and StrictMode doubles effects again on top of that.
 */
function trackPhaseStart(task: TimeEntryTaskRef | null, phaseId: string): void {
  if (task) useTimeEntryStore.getState().start(task, { source: 'pomodoro', phaseId })
}

/**
 * Versions: v1 linked at most one task; v2 a list; v3 added per-task
 * `attribution` and real `segments`; v4 `run.tasksPinned`; v5
 * `settingsUpdatedAt`; **v6 replaces the whole session-history model with the
 * time-entry ledger** (features/tracking) plus this phase log.
 *
 * **`settings.trackedTagIds` is the thing this function exists to protect.**
 * That list is hand-curated and unrecoverable, and zustand silently discards
 * stored state on a version bump when no `migrate` is supplied — it only
 * console.errors. Everything else here could be defaulted; that list could not.
 *
 * Pre-v6 `history` is deliberately **discarded rather than converted**. Those
 * records held per-task *totals* with no time coordinates, so there is
 * genuinely nothing to reconstruct intervals from — a conversion could only
 * invent timings and present them as recorded, which is precisely what the
 * ledger exists to stop. A mid-flight run resets to idle for the same reason.
 *
 * Exported and named so the riskiest code in the feature is a plain unit test.
 */
export function migratePomodoroState(persisted: unknown, _version: number): PomodoroStoreState {
  const p = (persisted ?? {}) as {
    settings?: Partial<PomodoroSettings>
    settingsUpdatedAt?: number
    phases?: PomodoroPhaseRecord[]
  }
  return {
    settings: { ...defaultPomodoroSettings(), ...p.settings },
    settingsUpdatedAt: typeof p.settingsUpdatedAt === 'number' ? p.settingsUpdatedAt : 0,
    run: IDLE_RUN_STATE,
    phases: Array.isArray(p.phases) ? p.phases : [],
  }
}

/**
 * `run` is persisted alongside settings/history on purpose: the timer is
 * pure timestamp-anchor state (see pomodoroEngine.ts), so a full page
 * reload mid-session costs nothing — advance() on mount rolls it forward
 * to the correct phase as if the tab had merely been backgrounded.
 */
export const usePomodoroStore = create<PomodoroStore>()(
  persist(
    (set, get) => ({
      settings: defaultPomodoroSettings(),
      run: IDLE_RUN_STATE,
      phases: [],
      settingsUpdatedAt: 0,

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch }, settingsUpdatedAt: Date.now() })),

      toggleTrackedTag: (tagId) =>
        set((state) => ({
          settings: {
            ...state.settings,
            trackedTagIds: state.settings.trackedTagIds.includes(tagId)
              ? state.settings.trackedTagIds.filter((t) => t !== tagId)
              : [...state.settings.trackedTagIds, tagId],
          },
          settingsUpdatedAt: Date.now(),
        })),

      pruneTrackedTag: (tagId) =>
        set((state) => ({
          settings: { ...state.settings, trackedTagIds: state.settings.trackedTagIds.filter((t) => t !== tagId) },
          settingsUpdatedAt: Date.now(),
        })),

      applySyncedState: ({ phases, settings, settingsUpdatedAt }) =>
        set({ phases, settings, settingsUpdatedAt }),

      startSession: (task) => {
        if (get().run.status !== 'idle') return // one clock; stop the current session first
        const now = new Date()
        const phaseId = randomId()
        set({
          run: {
            ...IDLE_RUN_STATE,
            status: 'running',
            phase: 'work',
            phaseId,
            runningStartedAt: now.toISOString(),
          },
        })
        trackPhaseStart(task === undefined ? inferPointerTask(now, get().settings.workMinutes) : task, phaseId)
      },

      pauseSession: () => {
        if (get().run.status !== 'running') return
        set((state) => ({
          run: {
            ...state.run,
            status: 'paused',
            segments: closeSegments(state.run, new Date()),
            runningStartedAt: null,
          },
        }))
        // A paused clock is not time spent. Resuming opens a *new* entry
        // rather than reopening this one, so the ledger shows two real
        // intervals instead of one with an invisible hole in it.
        useTimeEntryStore.getState().stop('user')
      },

      resumeSession: () => {
        if (get().run.status !== 'paused') return
        set((state) => ({
          run: { ...state.run, status: 'running', runningStartedAt: new Date().toISOString() },
        }))
        const run = get().run
        if (run.phaseId) {
          trackPhaseStart(inferPointerTask(new Date(), get().settings.workMinutes, run.phaseId), run.phaseId)
        }
      },

      startNextPhase: () => {
        if (get().run.status !== 'awaiting') return
        const now = new Date()
        set((state) => ({
          run: {
            ...state.run,
            status: 'running',
            segments: [],
            phaseId: randomId(),
            runningStartedAt: now.toISOString(),
          },
        }))

        const run = get().run
        if (run.phase === 'work' && run.phaseId) {
          // Re-infer at every focus phase: whatever is already tracked wins,
          // else the timeline's suggestion for right now. Without this, a task
          // chosen at 9am stays pointed at all day — long after it was
          // finished and its successor scheduled.
          trackPhaseStart(inferPointerTask(now, get().settings.workMinutes), run.phaseId)
        } else {
          // A break starts: whatever was open closes here. Breaks never track
          // time, which is what keeps "focus today" meaning focus.
          useTimeEntryStore.getState().stop('phase')
        }
      },

      stopSession: () => {
        const before = get()
        if (before.run.status === 'idle') return
        const now = new Date()
        const segments = closeSegments(before.run, now)
        const isPartialWork = before.run.phase === 'work' && before.run.status !== 'awaiting'

        set((state) => ({
          run: IDLE_RUN_STATE,
          phases:
            isPartialWork && segments.length > 0
              ? [
                  ...state.phases,
                  createPhaseRecord({
                    phase: 'work',
                    startedAt: segments[0].startedAt,
                    endedAt: segments[segments.length - 1].endedAt,
                    plannedMs: state.settings.workMinutes * 60_000,
                    segments,
                    completedNaturally: false,
                  }, before.run.phaseId ?? undefined),
                ]
              : state.phases,
        }))
        useTimeEntryStore.getState().stop('user')
      },

      advance: () => {
        const state = get()
        const { run, completed } = advancePhase(state.run, state.settings, new Date())
        if (completed === null) return null
        const phases = [
          ...state.phases,
          createPhaseRecord({
            phase: completed.phase,
            startedAt: completed.startedAt,
            endedAt: completed.endedAt,
            plannedMs: completed.durationMinutes * 60_000,
            segments: completed.segments,
            completedNaturally: true,
          }, completed.id ?? undefined),
        ]
        set({ run, phases })
        // The pointer deliberately keeps running past the bell: if you finish
        // a thought after the phase ends, those minutes were still spent on
        // the task. The phase record says 25 minutes and the entry may say 31
        // — both true, and that disagreement is the point of separating them.
        // It closes when a break starts, when you stop, or when the idle
        // reconciliation prompt trims it.
        return completed
      },
    }),
    {
      name: 'habitica-frontend:pomodoro',
      version: 5,
      partialize: (state): PomodoroStoreState => ({
        settings: state.settings,
        run: state.run,
        phases: state.phases,
        settingsUpdatedAt: state.settingsUpdatedAt,
      }),
      migrate: (persisted, version) => migratePomodoroState(persisted, version),
    },
  ),
)
