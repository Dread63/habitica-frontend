import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toDateOnlyString } from '@/lib/dateOnly'
import { minutesFromDate } from '@/lib/timeOfDay'
import { entriesForDate, focusCandidateEntries } from '@/features/timeline/timelineEntries'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import {
  advancePhase,
  closeSegments,
  defaultPomodoroSettings,
  IDLE_RUN_STATE,
  segmentsMs,
  type CompletedPhase,
  type FocusSegment,
  type PomodoroRunState,
  type PomodoroSettings,
  type PomodoroTaskRef,
} from './pomodoroEngine'
import { buildSessionRecord, type PomodoroSessionRecord } from './pomodoroStats'

interface PomodoroStoreState {
  settings: PomodoroSettings
  run: PomodoroRunState
  history: PomodoroSessionRecord[]
}

interface PomodoroStore extends PomodoroStoreState {
  updateSettings: (patch: Partial<PomodoroSettings>) => void
  toggleTrackedTag: (tagId: string) => void
  /** Called when a tag is deleted — mirrors tagFilterStore.pruneTag (wired
   * into useDeleteTag). Past session records keep their tag *snapshots*;
   * aggregation is a live intersection, so no history cleanup is needed. */
  pruneTrackedTag: (tagId: string) => void
  /**
   * Starts a fresh cycle against zero, one, or several linked tasks.
   * `pinned` records whether the user chose them (a specific task's timer
   * button, an edited chip queue) or merely accepted the timeline's
   * suggestion — an unpinned set is re-derived at every later focus phase.
   */
  startSession: (tasks: PomodoroTaskRef[], pinned?: boolean) => void
  /**
   * Replace the linked set mid-session — a 25-minute block often covers more
   * than one thing. Always *pins*: editing the chips is the user saying what
   * this session is about, and that has to outlive the next phase boundary
   * (which otherwise re-derives an unpinned set from the timeline). The
   * linked set is also the attribution fallback for time the timeline
   * doesn't cover — see focusAttribution.ts.
   */
  setSessionTasks: (tasks: PomodoroTaskRef[]) => void
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
   * Recomputes `run` against the real clock, logging a newly-completed work
   * phase to history and returning it so the caller can chime/notify.
   * Called from PomodoroStatusPill (1s tick while running + visibilitychange
   * + mount) — the store itself never registers listeners or plays sounds,
   * matching this codebase's convention of effects living in components.
   */
  advance: () => CompletedPhase | null
}

/** < 1 min of focus isn't a session worth logging. */
const MIN_LOGGED_MS = 60_000

/**
 * The tasks a focus phase starting *now* should link to, read straight off
 * the timeline. Lives in the store rather than the panel because the panel is
 * mounted twice at once on the Timeline page (the rail and the dialog's Timer
 * tab), so an effect there would fire twice; the store is the single owner.
 * Identity comes from each entry's snapshot — the store has no query cache —
 * which `useTimelineSnapshotSync` keeps current.
 */
export function autoLinkedTasks(now: Date, windowMinutes: number): PomodoroTaskRef[] {
  const dayEntries = entriesForDate(useTimelineEntryStore.getState().entries, toDateOnlyString(now))
  const refs: PomodoroTaskRef[] = []
  for (const entry of focusCandidateEntries(dayEntries, minutesFromDate(now), windowMinutes)) {
    const snapshot = entry.taskSnapshot
    if (!snapshot || refs.some((r) => r.id === entry.taskId)) continue
    refs.push({ id: entry.taskId, text: snapshot.text, tagIds: snapshot.tagIds })
  }
  return refs
}

/**
 * Builds the history record for a finished work phase, splitting its minutes
 * across tasks by overlapping the phase's real running intervals against the
 * timeline *as it stands right now* — deliberately at phase end, not live,
 * because blocks get rearranged mid-session and the arrangement you finished
 * with is the one you meant.
 */
function logWorkPhase(
  segments: FocusSegment[],
  tasks: PomodoroTaskRef[],
  durationMinutes: number,
  completedNaturally: boolean,
): PomodoroSessionRecord {
  return buildSessionRecord({
    segments,
    tasks,
    entries: useTimelineEntryStore.getState().entries,
    durationMinutes,
    completedNaturally,
  })
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
      history: [],

      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

      toggleTrackedTag: (tagId) =>
        set((state) => ({
          settings: {
            ...state.settings,
            trackedTagIds: state.settings.trackedTagIds.includes(tagId)
              ? state.settings.trackedTagIds.filter((t) => t !== tagId)
              : [...state.settings.trackedTagIds, tagId],
          },
        })),

      pruneTrackedTag: (tagId) =>
        set((state) => ({
          settings: { ...state.settings, trackedTagIds: state.settings.trackedTagIds.filter((t) => t !== tagId) },
        })),

      startSession: (tasks, pinned = false) => {
        if (get().run.status !== 'idle') return // one clock; stop the current session first
        set({
          run: {
            ...IDLE_RUN_STATE,
            status: 'running',
            phase: 'work',
            tasks,
            tasksPinned: pinned,
            runningStartedAt: new Date().toISOString(),
          },
        })
      },

      setSessionTasks: (tasks) =>
        set((state) => {
          if (state.run.status === 'idle') return state
          return { run: { ...state.run, tasks, tasksPinned: true } }
        }),

      pauseSession: () =>
        set((state) => {
          if (state.run.status !== 'running') return state
          return {
            run: {
              ...state.run,
              status: 'paused',
              segments: closeSegments(state.run, new Date()),
              runningStartedAt: null,
            },
          }
        }),

      resumeSession: () =>
        set((state) => {
          if (state.run.status !== 'paused') return state
          return { run: { ...state.run, status: 'running', runningStartedAt: new Date().toISOString() } }
        }),

      startNextPhase: () =>
        set((state) => {
          if (state.run.status !== 'awaiting') return state
          const now = new Date()
          // Re-read the timeline when a *focus* phase begins. Without this the
          // set picked when the session started stays linked for the rest of
          // it — so finishing a task early, ticking it off, and scheduling its
          // successor in the same slot left the next phase still pointing at
          // the finished one. A hand-picked set is left alone.
          const tasks =
            state.run.phase === 'work' && !state.run.tasksPinned
              ? autoLinkedTasks(now, state.settings.workMinutes)
              : state.run.tasks
          return {
            run: {
              ...state.run,
              status: 'running',
              tasks,
              segments: [],
              runningStartedAt: now.toISOString(),
            },
          }
        }),

      stopSession: () =>
        set((state) => {
          if (state.run.status === 'idle') return state
          const segments = closeSegments(state.run, new Date())
          const elapsed = segmentsMs(segments)
          const history =
            state.run.phase === 'work' && state.run.status !== 'awaiting' && elapsed >= MIN_LOGGED_MS
              ? [...state.history, logWorkPhase(segments, state.run.tasks, Math.round(elapsed / 60_000), false)]
              : state.history
          return { run: IDLE_RUN_STATE, history }
        }),

      advance: () => {
        const state = get()
        const { run, completed } = advancePhase(state.run, state.settings, new Date())
        if (completed === null) return null
        const history =
          completed.phase === 'work' // breaks aren't focus time
            ? [
                ...state.history,
                logWorkPhase(completed.segments, state.run.tasks, completed.durationMinutes, true),
              ]
            : state.history
        set({ run, history })
        return completed
      },
    }),
    {
      name: 'habitica-frontend:pomodoro',
      version: 4,
      partialize: (state): PomodoroStoreState => ({
        settings: state.settings,
        run: state.run,
        history: state.history,
      }),
      /**
       * v1 linked at most one task (taskId + snapshots); v2 links a list; v3
       * adds per-task `attribution` to records, replaces the run's
       * `elapsedMsBeforeStart` scalar with real `segments`, and adds the
       * sound/notification settings that manual phase advance needs; v4 adds
       * `run.tasksPinned` (history untouched — the run resets anyway).
       *
       * History migrates without losing anything, but note what it can't
       * reconstruct: pre-v3 records only know *which* tasks a session was
       * linked to, never when each was worked on. The best unbiased estimate
       * is an even split of the session's duration across its linked tasks,
       * which is what's written — it conserves total time, and leaves the
       * common one-task session's numbers exactly as they were. Multi-task
       * sessions do shift: v2 credited every linked task the session's whole
       * duration, so a 25-minute block linking a Work task and a School task
       * reported 25 minutes of each. It now reports 12.5 of each. That's a
       * correction, not a regression — the old figure was the double
       * counting this whole rework exists to remove.
       *
       * A mid-flight run resets to idle rather than guessing at segment
       * boundaries that were never recorded.
       */
      migrate: (persisted) => {
        const p = persisted as {
          settings?: Partial<PomodoroSettings>
          run?: unknown
          history?: (Partial<PomodoroSessionRecord> & {
            taskId?: string | null
            taskTextSnapshot?: string | null
            taskTagIdsSnapshot?: string[]
          })[]
        }
        const defaults = defaultPomodoroSettings()
        return {
          settings: { ...defaults, ...p.settings },
          run: IDLE_RUN_STATE,
          history: (p.history ?? []).map((r) => {
            const tasks: PomodoroTaskRef[] = Array.isArray(r.tasks)
              ? r.tasks
              : r.taskId
                ? [{ id: r.taskId, text: r.taskTextSnapshot ?? '', tagIds: r.taskTagIdsSnapshot ?? [] }]
                : []
            const durationMinutes = r.durationMinutes ?? 0
            return {
              id: r.id ?? crypto.randomUUID(),
              tasks,
              attribution:
                r.attribution ??
                tasks.map((t) => ({
                  taskId: t.id,
                  text: t.text,
                  tagIds: t.tagIds,
                  minutes: Math.round((durationMinutes / tasks.length) * 100) / 100,
                })),
              startedAt: r.startedAt ?? new Date().toISOString(),
              endedAt: r.endedAt ?? new Date().toISOString(),
              durationMinutes,
              completedNaturally: r.completedNaturally ?? true,
            }
          }),
        }
      },
    },
  ),
)
