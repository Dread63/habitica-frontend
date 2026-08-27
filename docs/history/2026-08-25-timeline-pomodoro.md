# Timeline + Pomodoro round

**When:** 2026-08-25

> Archived verbatim from the pre-2026-08-27 `CLAUDE.md`. References to sections
> "above" or "below" mean earlier/later rounds in `docs/history/README.md`.

---

> [!WARNING]
> **Partly superseded.** The 2026-08-27 time-tracking rebuild deleted `PomodoroSessionRecord`, `pomodoroStats.ts`, `rollForward`, `addTaskToSession`/`removeTaskFromSession` and `elapsedMsBeforeStart`.
> Read `docs/time-tracking.md` for the model that is actually in the code.
> This file is kept because the *reasoning* is still useful, not as a description
> of current behaviour.

Timeline + Pomodoro round (2026-08-25 — a whole new local-only feature layer, phase-sized, four
design forks settled via `AskUserQuestion` before any code: one-off-per-day scheduling (not a
recurring template), a horizontal scrubber layout (not a vertical day-calendar) that must support
*overlapping* placements, pomodoro categories = a user-curated subset of existing tags (not all
tags — "Home" is noise next to "School"/"Work"), and building it all together rather than staged):

- **The layer is entirely app-local.** Nothing here touches Habitica's API or its types —
  `lib/habitica/types.ts` stays a strict mirror, and timeline/pomodoro state is joined against
  live tasks by `taskId` at render time only. Two new feature dirs: `src/features/timeline/` and
  `src/features/pomodoro/`, plus `src/lib/timeOfDay.ts` (the time-of-day sibling of `dateOnly.ts`
  — local-only, deliberately no `toApiDateTime` equivalent).
- **`/timeline` route + first shared chrome**: `App.tsx` grew a thin nav strip (`NavLink`s for
  Dashboard/Timeline + the pomodoro status pill), hidden while logged out. Day navigation lives
  in a `?date=` URL param (bookmarkable, refresh-safe; store stays date-agnostic).
- **`TimelineEntry`** (`timelineEntries.ts`): `{id, taskId, date "YYYY-MM-DD", startMinutes,
  durationMinutes, createdAt}` — entries can't cross midnight (clamped), min 5 min, default 30,
  15-min drag grid. Store: `timelineEntryStore.ts`, persisted under
  `habitica-frontend:timeline-entries`. Rewards are excluded everywhere via
  `isSchedulableTaskType` (added to `taskType.ts`, shared with the pomodoro task picker);
  *completed* tasks stay schedulable/visible on purpose — reviewing the day is half the point.
- **Overlap renders as lanes** (`timelineLanes.ts`): greedy minimum-meeting-rooms interval
  packing, half-open intervals (touching blocks aren't overlapping), deterministic regardless of
  input order, provably lane-optimal (chain A↔B↔C needs 2 lanes, not 3). Tested against exactly
  those cases. `TimelineScrubber.tsx` renders it: fixed 96px/hour scale, horizontal scroll
  (auto-positioned near "now"), a real-time now-line (today only, fresh-derived 30s tick — no
  anchor state needed, unlike the pomodoro clock).
- **Three ways to schedule, one accessible core**: native HTML5 drag-and-drop (unscheduled rail →
  scrubber with `task:<id>` payload, block repositioning with `entry:<id>` — same
  mouse-only-caveat-with-accessible-fallback convention as TodoBoard's DnD), the app's **first
  right-click context menu** (`TaskContextMenu.tsx`, modeled on `LaterDatePopover`'s hand-rolled
  fixed-position chrome; "Send to timeline (now)" = one click at the next grid slot), and
  `ScheduleFields.tsx` — bare date/hour/minute/duration controls split from `SchedulePopover.tsx`
  exactly like `CalendarGrid` vs `DatePicker`, reused inline in `TaskEditorDialog`'s edit form
  (edit-mode only; a not-yet-created task has no id) and behind a clock icon-button on every
  schedulable `TaskCard`. Cards show a violet "scheduled at H:mm" pill for *today's* entry only.
- **Pomodoro is timestamp-anchor state, never a countdown** (`pomodoroEngine.ts`): `run` persists
  only `runningStartedAt` + `elapsedMsBeforeStart` (+ phase/cycle bookkeeping); everything shown
  is recomputed from `Date.now()`. `rollForward` catches up any number of missed phase boundaries
  (backgrounded tab, closed browser — the run state is *persisted*, so a reload mid-session
  resumes correctly via an `advance()` on mount), re-anchoring each next phase at the previous
  one's end so overflow carries instead of dropping. The always-mounted `PomodoroStatusPill` (in
  the nav strip) owns the clock loop (1s tick while running + `visibilitychange` + mount);
  dialog/panels are just views. Tested incl. a 3-hour-backgrounded scenario asserting no time
  lost or double-counted across ten phase seams.
- **Sessions link a *list* of tasks** (`PomodoroTaskRef[] = {id, text, tagIds}[]` on the run
  state and on each `PomodoroSessionRecord` — a 25-minute block often covers several things;
  add/remove mid-session via `addTaskToSession`/`removeTaskFromSession`, and the linked set at
  phase-completion time is what gets snapshotted). This was a v2 reshape from the original
  single-`taskId` model — the persist `migrate` converts v1 history losslessly and resets any
  mid-flight v1 run to idle. Snapshots mean history stays readable after a task is deleted or
  renamed — deliberately the *opposite* of `TimelineEntry`, which IS pruned on task delete
  (`pruneTask` wired into `useDeleteTask`, mirroring `pruneTag`; a placement pointing at nothing
  is clutter, history is a record of real time spent). Category stats
  (`pomodoroStats.aggregateByCategory`) union tag ids *across a session's linked tasks first*
  (two Work tasks in one block = one block of Work, not two — tested), then take a **live
  intersection** with `settings.trackedTagIds` — untracking a tag retroactively removes it from
  totals, tracking one retroactively adds it, a session whose union carries two tracked tags
  counts fully toward both. Tag deletion prunes the tracked set (`pruneTrackedTag` in
  `useDeleteTag`) but never touches history.
- **`PomodoroPanel.tsx` is the one timer surface** (an SVG donut ring that fills as the phase
  elapses — violet for focus, green for breaks — with the countdown centered, linked-task chips,
  and start/pause/stop): rendered in the Timeline page's rail (the "leave it open on a monitor"
  view, live next to the moving now-line) *and* as the dialog's Timer tab, one component so the
  two can't drift (the original separate `PomodoroTimerPanel` was deleted in this unification).
  When idle it **auto-picks the focus task from the timeline** — whatever's live right now, else
  the next upcoming block today (`currentOrNextEntry` in `timelineEntries.ts`, tested; overlap
  ties go to the most recently started) — shown as a labeled suggestion ("live now"/"up next")
  that editing the chip queue overrides until the next session ends. The nav pill stays on every
  page and still owns the authoritative clock loop.
- **Scrubber interaction round (same day, on direct feedback)**: blocks got genuinely bigger
  (64px lanes, text-sm titles, 160px/hour default scale — the old size truncated titles to a few
  letters); **scroll-wheel zooms** (48–320px/hr, cursor-anchored, native non-passive wheel
  listener since React's synthetic wheel can't preventDefault); **click-drag on empty space
  pans** (pointer capture, skipped when the press lands on a `[data-block]`); **block edges
  drag-resize** with a live snapped-time bubble (:15 grid, Apple-Calendar-style — pointer
  capture on the handles, preview state committed to the store on release, `preventDefault` on
  handle pointerdown so the parent's HTML5 drag doesn't also fire). `ScheduleFields` became
  type-and-tab: a typed 24h "HH:mm" input (autofocused+selected in popover contexts via
  `autoFocusTime`, not in the inline editor) → duration → date, Enter saves. Unscheduled groups
  collapse per-type. `PomodoroDayStats.tsx` (focus today / pomodoros completed today / top-3
  category bars) fills the space under the scrubber; all-time stats stay in the dialog.
  Auto-select got two fixes: it now suggests **every block overlapping the next session's window**
  (`entriesInWindow(now, workMinutes)`, tested — live blocks plus ones starting before the
  session would end, falling back to next-upcoming), and the idle panel ticks (30s +
  visibilitychange) so a block going live gets picked up on the fly instead of waiting for a
  re-render from some other change.
- **Unscheduled rail is grouped by type** (Habits/Dailies/To-Dos, same order and accent-underline
  header style as the Dashboard rail) and the Timeline page renders the same global
  `TagFilterSidebar` below it — one filter concept app-wide, narrowing the pick-list. Emoji
  shortcodes render properly in the rail rows, timeline blocks, pomodoro chips/pill/history
  (the same `emojify` + `useTwemoji` two-step as TaskCard — a regression that had to be fixed
  here once already; any new surface that renders `task.text` needs both steps).
- **Deliberate scope calls, flagged not silent**: stopping a work phase early logs the actual
  minutes (`completedNaturally: false`) rather than discarding them; breaks aren't logged as
  focus time; one session at a time (`startSession` requires idle); browser Notifications on
  phase completion deferred; drag-to-resize deferred (duration edits go through ScheduleFields).
- **Not browser-verified**: same honesty convention as previous rounds — typecheck/tests/build
  all pass, but no browser automation was available in this session, so the rendered
  scrubber/DnD/popovers deserve a real `npm run dev` click-through. Login-gated pages can't be
  screenshotted without real credentials anyway.

