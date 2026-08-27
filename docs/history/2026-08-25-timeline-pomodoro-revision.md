# Timeline + Pomodoro revision round (and follow-up fixes)

**When:** 2026-08-25

> Archived verbatim from the pre-2026-08-27 `CLAUDE.md`. References to sections
> "above" or "below" mean earlier/later rounds in `docs/history/README.md`.

---

> [!WARNING]
> **Partly superseded.** Everything here about *focus attribution* is gone. The 2026-08-27 rebuild deleted `focusAttribution.ts`, `pomodoroStats.ts`, `useLiveFocusSession.ts`, `run.tasks`, `run.tasksPinned`, `setSessionTasks` and `autoLinkedTasks`. Time is now recorded as it happens, never attributed after the fact.
> Read `docs/time-tracking.md` for the model that is actually in the code.
> This file is kept because the *reasoning* is still useful, not as a description
> of current behaviour.

Timeline + Pomodoro revision round (2026-08-25, immediately after the above — seven items from
actually using the feature. Four genuine forks settled via `AskUserQuestion` before any code:
what happens to focus time no timeline block covers, how a task carrying two tracked tags counts,
how loudly a phase end announces itself, and where category colors come from):

- **Fixed the "Deleted task" bug, at its source.** Ticking off a scheduled to-do turned its
  timeline block into "Deleted task". Nothing was deleted — **`GET /tasks/user` simply stops
  returning a to-do once it's complete** (the same API behavior the Dashboard's "Show completed"
  toggle already worked around), so any feature holding a task *id* lost the ability to name it.
  Two independent fixes, deliberately both: `useTaskLookup()` (`useTasks.ts`) merges the
  `?type=completedTodos` query into a single id→Task map that the Timeline page resolves blocks
  against — live data, so a completed block still strikes through and still opens its detail
  view — **and** `TimelineEntry` now carries a `taskSnapshot` (`{text, type, tagIds}`) as a
  fallback, which also covers the first-paint fetch gap and a task deleted on habitica.com
  directly (which never runs this app's `pruneTask` cascade). `useTimelineSnapshotSync()` (mounted
  once in App's authed shell) keeps snapshots fresh so a rename propagates instead of freezing at
  scheduling time. **Store-version footgun found and avoided while doing this**: bumping a
  zustand `persist` `version` *without* a `migrate` function makes it **discard** the stored state
  outright (it only `console.error`s — confirmed in `node_modules/zustand/middleware.js`), so the
  timeline store's v1→v2 bump ships an explicit identity migration rather than silently wiping
  every placement the user had made.
- **The timer no longer rolls itself into the next phase.** New `awaiting` status
  (`pomodoroEngine.ts`): a phase that runs its full length is logged and the run parks on the
  *next* phase with the clock stopped until `startNextPhase()`. `rollForward` (multi-phase
  catch-up) is gone, replaced by `advancePhase` which completes **at most one** phase — so a tab
  left closed for three hours comes back to "focus finished at 10:25, start when you're ready"
  instead of six imaginary phases. This also removed the guesswork from attribution below: an
  ignored auto-started break used to be indistinguishable from real focus time.
- **Phase-end alerting** (`pomodoroNotify.ts`), now mandatory rather than deferred, since nothing
  else marks the seam: a WebAudio chime (no asset file, no CDN) plus a browser Notification, both
  opt-out in Settings. Two gesture constraints handled explicitly — the AudioContext is primed
  from the Start click (`primeAudio`), because browsers won't start audio from a timer callback
  minutes later, and the permission prompt fires from that same click when undecided rather than
  hiding behind a Settings tab. Stale alerts are suppressed (`ALERT_STALENESS_MS`) so reopening
  the app tomorrow doesn't announce yesterday's last pomodoro.
- **Focus time is now attributed proportionally** — the headline change. `focusAttribution.ts`
  overlaps a finished phase's *real running intervals* against the timeline **as it stands at
  phase end**, so a 25-minute block covering ten minutes of School and fifteen of Work reports
  exactly that instead of 25 of each. Rules, in order: covered by one block → that task; covered
  by several overlapping blocks → split evenly; covered by none → split evenly across the
  session's linked chips (chosen over dropping it, so unscheduled focus still earns credit);
  neither → `Uncategorized`. Computing it at the end is what makes "I moved blocks around
  mid-session" behave correctly — the arrangement you finished with is the one that counts.
  - **Pause handling turned out to be simple, not complicated** (it was raised as a worry):
    `PomodoroRunState` now stores `segments: {startedAt, endedAt}[]` — the intervals the clock
    actually ran — and elapsed time is *derived* from them rather than stored alongside them, so
    the two can't disagree. A phase run 9:00–9:10, paused, resumed 9:30–9:45 attributes only
    those two windows; a block sitting squarely in the pause gap earns nothing. The scalar
    `elapsedMsBeforeStart` it replaced is gone.
  - **Tag-level double counting was kept deliberately** (explicit decision): a task carrying two
    *tracked* tags credits its minutes fully to both, so a task tagged Work and Deep Work isn't
    reported as half of each. The consequence is stated rather than hidden — category totals can
    exceed real elapsed time, which is exactly why nothing in the UI stacks them into a bar
    claiming to be a whole. The 7-day trend, which *does* have to partition a whole, uses a
    single **primary** category per slice (first in tracked order) and says so on screen.
  - `PomodoroSessionRecord` gained `attribution: FocusAttribution[]`; store version 3. The
    migration reconstructs pre-v3 records as an **even split** across their linked tasks —
    conserves total time, leaves the common one-task session untouched, and corrects (not
    regresses) the multi-task case v2 over-counted.
  - Verified by `pomodoroStore.test.ts` — 11 integration tests driving the real store + timeline
    store through a fake clock, covering pause/resume, blocks rearranged mid-session, and a
    completion detected five hours late still attributing to the right window.
- **Category colors + a real stats surface.** `--cat-1..8` in `index.css` (light + dark) with
  positional assignment in `pomodoroCategories.ts` — the Nth tracked tag gets the Nth slot, never
  cycled; past eight, neutral + grouped as "Other" in charts but still listed individually. The
  palette is the dataviz skill's validated categorical set, **re-run against this app's own card
  surfaces** (`#ffffff` / `#16151f`) rather than trusted from the reference doc: both modes pass,
  light mode warns on contrast for three slots, which is why every category readout carries a
  visible name and minute count beside its swatch (the documented "relief rule"). Don't re-hex or
  reorder them without re-running `scripts/validate_palette.js` for both surfaces.
  `PomodoroDayStats` was rebuilt around the day the timeline is *showing* (it takes a `date`
  prop now): four stat tiles, color-coded category bars with shares, a 7-day stacked-column trend
  with hover tooltip and legend, and a "where the time went" per-task list. The dialog's
  all-time Stats tab picked up the same palette and a most-focused-tasks list.
- **Unscheduled rail reordered**: To-Dos → Dailies → Habits (deliberately *not* the Dashboard
  rail's order — this list answers "what should I block time for next?", and that's almost always
  a deadline-bearing to-do). To-Dos and Dailies sort by `sortTasksByDueDate` (soonest first, which
  puts overdue at the very top; undated last), and each row now shows its due date so the ordering
  is legible rather than mysterious. *(The request said "descending"; the worked example — today
  above tomorrow, overdue at top — describes ascending, which is what's built.)*
- **Clicking a timeline block opens the full task detail view**, the same dialog the Dashboard's
  cards open. `TaskDetailDialogHost` inverts TaskCard's pattern (which keeps one dialog mounted
  per card): the page holds a selected task *id* — not the Task object the click carried, or
  in-dialog edits would render against a frozen copy — and mounts the dialog on demand.
  `TaskEditorDialog` gained an `onClose` passthrough for it. Schedule editing moved to a hover
  clock button on the block, so the two actions don't compete for the same click.
- **Scheduling is start-time → end-time**, not start + duration (`ScheduleFields`). Blocks are
  drawn between two edges, dragged by an edge, and labeled "9:00 – 9:45"; typing "45" to mean
  "until 9:45" made the typed path the odd one out. Duration is derived and echoed back as a live
  hint. `hhmmToEndMinutes` (`timeOfDay.ts`) accepts `24:00` as end-of-day, kept separate from the
  strict `hhmmToMinutes` since a *start* of 24:00 is still nonsense. An end at or before the start
  is a validation error, not an inferred midnight wrap — entries can't cross midnight by design.
- **Not browser-verified**, same as the round above: `npm run typecheck`, `npm run lint`, the test
  suite, and `npm run build` all pass, but no browser automation was available here either, so the
  rebuilt stats charts and the block-click/detail-dialog path deserve a real `npm run dev`
  click-through.

Auto-link follow-up fix (same day, from real use — "I finished CAAS sprint 5 early, ticked it
off, made and scheduled sprint 6, and the next focus session still auto-linked the *completed*
sprint 5"). Two independent bugs, both introduced by the round above:

- **A finished block was still a valid auto-pick.** The snapshot fallback added for the "Deleted
  task" fix did its job too well: it let a completed to-do — which Habitica no longer returns
  from `GET /tasks/user` — resolve to a chip and get suggested. Completed blocks *should* stay on
  the timeline and *should* keep their name (reviewing the day is the point); they just must
  never be proposed as the next thing to work on. New pure `focusCandidateEntries`
  (`timelineEntries.ts`) is now the single home for that rule — window/next-upcoming selection
  minus anything finished — replacing the `entriesInWindow`/`currentOrNextEntry` pair the panel
  open-coded. It reads completion off `TimelineTaskSnapshot.completed` (new field) rather than
  live task data, so it stays pure and callable from the store, which has no query cache; an
  entry with no snapshot yet counts as open, since "unknown" shouldn't hide a block.
  - **Consequence worth knowing**: `useTimelineSnapshotSync` had to move from `useTasks` to
    `useTaskLookup`. It isn't optional — `syncTaskSnapshots` keeps the existing snapshot for any
    task missing from the map, and a to-do *vanishes* from the plain query the moment it's
    completed, so on `useTasks` a finished to-do would keep `completed: false` forever. That
    makes the `?type=completedTodos` request app-wide (one per stale window, deduped, and it
    warms the cache the Dashboard's "Show completed" toggle reads).
- **The linked set was frozen at session start.** Even with the above fixed, `run.tasks` was
  chosen once and never revisited, so the phase *after* a break still pointed at whatever was
  live an hour earlier — which is what "the next focus session" in the report actually meant.
  `PomodoroRunState.tasksPinned` (store v4) now distinguishes a set the user hand-picked from one
  the timeline merely suggested, and `startNextPhase` re-derives an unpinned set from the
  timeline whenever a **focus** phase begins (never a break). Pinned by: editing the chips
  (`setSessionTasks`, which replaced the old `addTaskToSession`/`removeTaskFromSession` pair so
  there's exactly one place that sets the flag), starting from a specific block's timer button,
  or starting from an idle queue the user edited. The re-derivation lives in the store
  (`autoLinkedTasks`), not the panel, **because `PomodoroPanel` is mounted twice at once on the
  Timeline page** — the rail and the always-rendered dialog Timer tab — so an effect there would
  fire twice. The panel now also shows the live suggestion at an awaiting-*work* seam, not just
  when idle, so what you see before pressing start is what gets linked.
- **Deliberately unchanged**: attribution still credits a completed task the time it was actually
  worked on — excluding finished blocks from *selection* must not retroactively erase focus time,
  since attribution reads the timeline, not the completion flag. There's a named test for it.
- Covered by 5 new cases in `timelineEntries.test.ts` and 5 in `pomodoroStore.test.ts`, one of
  which replays the sprint-5/sprint-6 report end to end.

Stats review + live-session fix (same day — "'Where the time went' doesn't update while I'm
doing focus sessions", plus a general accuracy/formatting review of the stats surfaces):

- **The reported bug was structural, not cosmetic: every stat read `history`, and `history` is
  only written when a phase *ends*.** So the whole panel — tiles, category bars, top tasks,
  trend — sat frozen for the entire 25 minutes of a session and jumped only at the seam. For a
  view whose stated purpose is sitting open on a monitor, that's a defect.
  - Fixed with `liveFocusSession()` (`pomodoroStats.ts`): a **provisional, display-only** record
    for the phase in flight, built from `closeSegments(run, now)` by the *same*
    `buildSessionRecord` the store commits with — a new shared helper, extracted precisely so the
    preview and the committed record can't drift. `useLiveFocusSession()` re-ticks it every 15s
    (whole-minute display, so 1s would burn renders for nothing) and only while the clock is
    genuinely running — a paused phase is frozen by construction.
  - **This does not weaken the "attribute at phase end" rule** (the explicitly-requested one):
    nothing is written to history, and at phase end the store still recomputes the real record
    from the final segments and the timeline as it stands then. Call sites merge it with
    `sessions.concat(live ?? [])`, so every reading picks it up with no special-casing.
  - What deliberately *excludes* the live session: "Pomodoros completed", "N stopped early", and
    "Average session" — all three describe *finished* sessions, and folding a partial one in
    would drag the day's average down as it ran. The Stats tab's "Sessions" count likewise stays
    on committed sessions. Everything else (focus total, category bars, tracked share, top
    tasks, trend column) includes it, with the tile hint reading "X logged · Y in progress" and
    a live dot on the task rows still being added to.
- Real problems found in the review pass and fixed alongside:
  - `formatFocusMinutes` printed genuine time as **"0m"** for anything under half a minute (an
    evenly-split slice, a session stopped seconds in) — a flat zero next to a visible bar reads
    as a bug. Now "<1m".
  - "In a tracked category" could show **101% or -1%**: attribution minutes are rounded to 2dp
    per item, so a long day drifts a hair past the session totals. Clamped to 0–100.
  - The trend tooltip resolved its day with a **non-null assertion** — changing the viewed date
    while a column was hovered could leave `hoveredDay` outside the new 7-day window and crash.
    Resolved and guarded instead.
  - "Where the time went" was **hidden entirely when empty**, which is exactly when a new user
    needs to be told what it's for; it now has an empty state. The category empty state also
    distinguishes "you haven't picked any tracked tags yet" from "these tasks carry none of
    them" — previously one message covered both and only made sense for the first.
  - Top-task list raised 4 → 6 with a "+N more" tail, so a busy day isn't silently truncated.
- Verified: typecheck, lint, 300 tests, build. Still no browser automation, so the live-updating
  panel itself wants a real click-through.

Completed-block time cutoff (same day — "sprint 5 is checked off but I'm still inside the window
I booked for it, and 'Where the time went' shows it actively tracking"):

- **A previous decision applied too bluntly.** The auto-link fix above deliberately kept
  attribution reading the timeline rather than the completion flag, on the reasoning that
  excluding finished blocks from *selection* must not retroactively erase focus time they had
  genuinely earned. That's right for time spent *before* the tick and wrong for time after it: a
  block booked 9:00–11:00 whose task was finished at 10:00 kept absorbing the second hour, so
  every minute then spent on its replacement landed on the completed task.
- **Fixed time-aware rather than by blanket exclusion**, because a blanket rule would break the
  original requirement (ten minutes of School then fifteen of Work inside one phase must split).
  `focusAttribution` now clips each block's covering interval at
  `taskSnapshot.completedAt`; everything before the cutoff is credited as before, everything
  after falls through to the next rule (another block, the linked chips, or Uncategorized).
- **Where `completedAt` comes from**: exact for to-dos, which carry `dateCompleted` from the API
  (`types.ts` — dailies have no equivalent field), otherwise the moment `syncTaskSnapshots` first
  observed the completion. The subtlety that needed care: for a daily, every sync proposes "now"
  as the completion time, so the sync **holds the first instant it recorded** instead of taking
  the newest — otherwise the cutoff would walk forward on every poll and never actually stop the
  block. It's cleared if the task returns to incomplete (cron reset, an undo).
- A completed block with **no** known instant (a snapshot written before this existed) keeps the
  old whole-window behavior and corrects itself on the next snapshot sync — which for a to-do is
  immediate, since `dateCompleted` was there all along.
- 9 new tests across `focusAttribution.test.ts`, `timelineEntries.test.ts` and
  `pomodoroStore.test.ts`, including the straddling case (phase spans the tick → time splits at
  it) and the full sprint-5/sprint-6 handover. 309 tests, typecheck/lint/build clean.

Changing a block's date duplicated it instead of moving it (bug, not intended):

- **Cause**: `ScheduleFields` resolved "the entry I'm editing" by looking it up as
  `entryForTaskOnDate(entries, task.id, draft.date)` — against the *currently selected* date. Pick
  tomorrow and the lookup finds nothing on the new day, so Save fell through to the create branch
  and left the original block sitting where it was. The form had no notion of *which* placement
  it was editing, only "is one already on the date now showing".
- **Fix**: the form anchors to the day it opened with (`anchorDate`, fixed for its lifetime) and
  resolves the placement against that — a *live* lookup, not one captured at mount, since the
  editor dialog's inline copy stays mounted for the life of its card and would otherwise go
  stale if the entry were created or removed meanwhile. Saving calls a new
  `rescheduleEntry(entryId, date, start, duration)` that changes the day in place, keeping the
  entry's identity. `moveEntry`/`resizeEntry` stay as they were — they only ever move a block
  *within* a day, which is all the drag interactions need.
- **Invariant kept**: `rescheduleEntry` drops any *other* placement of the same task already on
  the target day, so one-placement-per-task-per-date (which `entryForTaskOnDate` and the
  unscheduled rail both assume) survives a move onto an occupied day. The form also falls back to
  a placement on the chosen date when it opened without an anchor, for the same reason.
- **Made visible rather than just correct**: the Save button now reads "Move to Aug 26" when the
  day changed, "Update" when it didn't, "Add to timeline" when there's nothing to move — the old
  label silently flipped to "Add to timeline" on a date change, which was the only hint the app
  gave that it was about to duplicate.
- 6 new tests: the pure `rescheduleEntry` plus a new `timelineEntryStore.test.ts` (the store's
  first direct test file) covering the move, the absorb-on-occupied-day case, other tasks left
  alone, and an unknown id being a no-op. 315 tests, typecheck/lint/build clean.

