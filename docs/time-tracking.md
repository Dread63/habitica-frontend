# Time tracking — three separate records

**Read this before touching `features/tracking`, `features/timeline` or `features/pomodoro`.**

Since the 2026-08-27 rework there are three records. Keeping them apart is what makes the
numbers trustworthy. Collapsing any two back together reintroduces the entire bug class the
rework removed.

| Record | Where | What it is | Mutable? |
|---|---|---|---|
| `TimelineEntry` | `features/timeline` | the **plan** — intentions, freely rearranged | yes (LWW + tombstones) |
| `TimeEntry` | `features/tracking` | the **ledger** — what was worked on, when | yes (LWW + tombstones, audited) |
| `PomodoroPhaseRecord` | `features/pomodoro` | what the **timer** did | no — append-only |

## The rules, all load-bearing

**Time is recorded, never inferred.** `startTracking` is the only opener and always closes the
current interval first, so at most one entry is open and no minute has two owners. There is no
attribution step and **no even-splitting anywhere**. If a number looks wrong, the fix is to
correct the entry that produced it.

**The plan is never evidence.** Editing a timeline block cannot change a recorded minute. That
was the whole bug.

**The ledger and the phase log will disagree**, e.g. "4 pomodoros · 1h 38m tracked". That is
correct output, not a defect: overrun past the bell counts as worked time, an ignored break
doesn't. There is UI copy explaining it. **Don't "reconcile" them into one number.**

**Deleting a task does NOT delete its time entries.** `handleTaskDeleted` only stops the
pointer. This is deliberately unlike `timelineEntryStore.pruneTask` and `tagFilterStore.pruneTag`
— a plan entry pointing at nothing is clutter, but the ledger is a record of real time spent.

**Open entries are never synced.** A live clock belongs to the machine it was started on. Same
for the pomodoro `run` state.

**No component opens or closes an entry from a `useEffect`.** `PomodoroPanel` is mounted twice
at once on the Timeline page and StrictMode doubles effects again. The only effect-driven
writers are `PomodoroStatusPill` and the single-mounted `TrackingReconciliationHost`.

**Every persisted store here needs an explicit `migrate` on a version bump.** Zustand silently
discards stored state without one, and `settings.trackedTagIds` is unrecoverable.

## Why it's built this way

The previous design inferred time after the fact: `attributeFocusTime` reconstructed "what was
I on at time T" at phase end by overlaying the *plan* (timeline blocks) onto the *clock*
(pomodoro segments). Nothing ever persisted the answer directly.

Every one of these was a real, reported consequence:

- moving a block at minute 20 retroactively re-attributed minutes 0–20
- a chip added at minute 24 claimed an even share of everything before it
- a chip removed at minute 24 got zero for the 24 minutes it had been attached
- overlapping blocks split 50/50 by guess
- a closed laptop logged a full phase as real focus

Patches were tried — clipping a block's interval at `taskSnapshot.completedAt` fixed one
instance — but the problem was architectural, not a set of bugs. The replacement is the model
Toggl/Clockify/Harvest use: a live "working on X" pointer writing real intervals as they happen.
Attribution ceased to exist; totals are now a sum.

**Deleted outright and not to be reintroduced:** `focusAttribution.ts`, `pomodoroStats.ts`,
`useLiveFocusSession.ts`, `PomodoroSessionRecord`, `run.tasks`, `run.tasksPinned`,
`setSessionTasks`, `autoLinkedTasks`, `mergeSessions`, `MIN_LOGGED_MS`, `LIVE_SESSION_ID`.

Full story: [`docs/history/2026-08-27-time-tracking-rebuild.md`](history/2026-08-27-time-tracking-rebuild.md).

## The pomodoro clock

**Timestamp-anchor state, never a countdown.** The run persists anchors and `segments:
{startedAt, endedAt}[]` — the intervals the clock actually ran — and elapsed time is *derived*
from them rather than stored alongside them, so the two can't disagree. Everything displayed is
recomputed from `Date.now()`.

**The timer never rolls itself into the next phase.** A phase that runs its full length is
logged and the run parks on the next phase with the clock stopped, status `awaiting`, until
`startNextPhase()`. `advancePhase` completes **at most one** phase — so a tab left closed for
three hours comes back to "focus finished at 10:25, start when you're ready", not six imaginary
phases.

**`PomodoroStatusPill` owns the authoritative clock loop** (1s tick while running,
`visibilitychange`, mount). It's in the nav strip on every page. Dialogs and panels are views.

**Phase-end alerting** is a WebAudio chime plus a browser Notification, both opt-out. Two
gesture constraints are handled explicitly: the AudioContext is primed from the Start click,
because browsers won't start audio from a timer callback minutes later, and the permission
prompt fires from that same click rather than hiding behind a Settings tab. Stale alerts are
suppressed so reopening the app tomorrow doesn't announce yesterday's last pomodoro.

## Idle reconciliation

A device-local heartbeat lets the app propose "keep until 2:32 PM" instead of asking you to
remember when you stopped. It is deliberately **not** gated on `visibilitychange` — a
backgrounded tab while you work must not look like absence.

The phase record still says the timer ran; the entry gets trimmed. They disagree, and that's
the correct output.

## Timeline entries

`{id, taskId, date "YYYY-MM-DD", startMinutes, durationMinutes, taskSnapshot, createdAt}`.
Entries can't cross midnight (clamped), minimum 5 minutes, default 30, 15-minute drag grid.
Rewards are never schedulable (`isSchedulableTaskType`); completed tasks stay schedulable and
visible on purpose — reviewing the day is half the point.

**One placement per task per date.** `entryForTaskOnDate` and the unscheduled rail both assume
it. `rescheduleEntry` preserves it by dropping any other placement of the same task on the
target day.

**`rescheduleEntry` moves a block across days keeping its identity**; `moveEntry`/`resizeEntry`
only move within a day. A form that resolves "the entry I'm editing" against the *currently
selected* date rather than the day it opened with will duplicate the block instead of moving
it — that was a real bug.

**`taskSnapshot` is a fallback, not the source of truth.** Blocks resolve against
`useTaskLookup()` first. The snapshot covers the first-paint fetch gap, a task completed (and
therefore dropped from `GET /tasks/user`), and a task deleted on habitica.com directly.
`useTimelineSnapshotSync()` keeps it fresh so renames propagate.

**Overlap renders as lanes** — greedy minimum-meeting-rooms interval packing, half-open
intervals so touching blocks aren't overlapping, deterministic regardless of input order, and
provably lane-optimal (a chain A↔B↔C needs 2 lanes, not 3).
→ `timelineLanes.ts`

## Plan vs actual

An "Actual" ribbon renders under the planned lanes, plus an adherence percentage. One lane
suffices because recorded intervals never overlap — the unbroken band *is* the proof.

The boundary-sweep code from the deleted attribution system survives here, repurposed as a
*comparison* rather than an *inference*. That distinction is the whole point of the rebuild.
