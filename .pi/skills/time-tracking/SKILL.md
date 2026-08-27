---
name: time-tracking
description: Load before changing anything in src/features/tracking, src/features/timeline or src/features/pomodoro, or anything that reports focus time, minutes worked, adherence, or category stats. Triggers include - TimeEntry, TimelineEntry, PomodoroPhaseRecord, the pomodoro engine or clock, the scrubber, plan-vs-actual, reconciliation, CSV export of time data, or a report that tracked numbers look wrong.
---

# Time-tracking work

**Read `docs/time-tracking.md` before editing.** This layer was rebuilt from scratch on
2026-08-27 because the original design was architecturally wrong, and the failure mode is
subtle: the numbers look plausible while being false.

## Three records. Never fuse them.

| Record | What it is | Mutable? |
|---|---|---|
| `TimelineEntry` | the **plan** — intentions, freely rearranged | yes |
| `TimeEntry` | the **ledger** — what was worked on, when | yes, audited |
| `PomodoroPhaseRecord` | what the **timer** did | no — append-only |

## The rules

- **Time is recorded, never inferred.** `startTracking` is the only opener and always closes the
  current interval first. At most one entry is open; no minute has two owners. There is no
  attribution step and **no even-splitting anywhere**.
- **The plan is never evidence.** Editing a timeline block cannot change a recorded minute.
- **The ledger and the phase log are supposed to disagree** ("4 pomodoros · 1h 38m tracked").
  Overrun past the bell counts; an ignored break doesn't. **Do not reconcile them into one
  number** — there is UI copy explaining the difference.
- **Deleting a task does not delete its time entries** (unlike `pruneTask`/`pruneTag`).
- **Open entries are never synced.** A live clock belongs to the machine that started it.

## Two traps that will bite you specifically

**`PomodoroPanel` is mounted twice at once** on the Timeline page — the rail and the
always-rendered dialog Timer tab — and StrictMode doubles effects again. **No component opens or
closes a time entry from a `useEffect`.** The only effect-driven writers are
`PomodoroStatusPill` and the single-mounted `TrackingReconciliationHost`. Logic that must run
once belongs in the store.

**Bumping a zustand `persist` version without a `migrate` silently discards the stored state** —
it only `console.error`s. Ship a migration on every bump, even an identity one.
`settings.trackedTagIds` is user-curated and unrecoverable.

## Do not reintroduce these

Deleted on purpose in the rebuild: `focusAttribution.ts`, `pomodoroStats.ts`,
`useLiveFocusSession.ts`, `PomodoroSessionRecord`, `run.tasks`, `run.tasksPinned`,
`setSessionTasks`, `autoLinkedTasks`, `mergeSessions`, `MIN_LOGGED_MS`, `LIVE_SESSION_ID`.

**`docs/history/2026-08-25-*.md` describe this deleted system in convincing detail.** They carry
superseded warnings. If history and `docs/gotchas.md` disagree, gotchas.md wins.

## Verifying a change here

The store tests drive the real stores through a fake clock — extend those rather than testing
pure helpers in isolation. Pure logic takes `now` as a parameter; never read the clock inside.

The hands-on check that matters and has never been done: drag a timeline block **during** a
focus phase and confirm the elapsed minutes do not move.
