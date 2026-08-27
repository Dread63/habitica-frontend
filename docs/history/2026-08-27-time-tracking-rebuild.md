# Time-tracking rebuild — record it, stop inferring it

**When:** 2026-08-27

> Archived verbatim from the pre-2026-08-27 `CLAUDE.md`. References to sections
> "above" or "below" mean earlier/later rounds in `docs/history/README.md`.

---

Time-tracking rebuild — record it, stop inferring it (2026-08-27). Direct report: the
pomodoro/timeline numbers "gave concern that things aren't being tracked properly, especially
when adding a task during an ongoing session or completing a task during an ongoing session".
That instinct was right, and the cause was architectural rather than a set of bugs.

- **The root cause.** Nothing persisted "what was I on at time T". `attributeFocusTime`
  reconstructed it at phase end by overlaying the *plan* (timeline blocks) onto the *clock*
  (pomodoro segments). So: moving a block at minute 20 re-attributed minutes 0–20; a chip added
  at minute 24 retroactively claimed an even share of everything before it; one removed at minute
  24 got zero for the 24 minutes it was attached; overlapping blocks split 50/50 by guess; and a
  closed laptop logged a full phase as real focus. The `completedAt` clipping added earlier was a
  patch on one instance of a general problem.
- **The fix**: a live "working on X" pointer writing real intervals as they happen — the model
  Toggl/Clockify/Harvest use. Attribution ceased to exist; totals are a sum. Four forks settled
  via `AskUserQuestion` first (pointer over pomodoro-only, exactly one active task, edit-with-audit
  over append-only-adjustments, and a clean start since there was no data worth migrating), plus
  three more on overrun/visualisation/untracked gaps.
- **Deleted outright**: `focusAttribution.ts` (+18 tests), `pomodoroStats.ts`,
  `useLiveFocusSession.ts`, `PomodoroSessionRecord`, `run.tasks`, `run.tasksPinned`,
  `setSessionTasks`, `autoLinkedTasks`, `mergeSessions`, `MIN_LOGGED_MS`. Deleting
  `LIVE_SESSION_ID` removed two UI special-cases for free.
- **Sequenced to stay shippable**: a pure-refactor step, then the model unwired, then a
  **dual-write** step asserting entry durations equalled segment durations before anything was
  removed. Steps 3+4 were collapsed once step 3 broke the shape step 4 deleted.
- **Server**: new `time_entries` (mutable, LWW + tombstones — `INSERT OR IGNORE` would silently
  drop a corrected end time) and `pomodoro_phases` (genuinely append-only, which is what the old
  `focus_sessions` claimed without deserving). `focus_sessions` is **retired, not dropped** —
  there's no schema-version column, so a DROP would be irreversible on a running NAS.
  `applySync` ignores a legacy `sessions` key, with a test, so a rolling deploy can't 500.
- **`mergeTimeline` generalised into `mergeVersioned<T>`** rather than copied — the
  tie-goes-to-delete rule is the subtlest code in the app and must exist once.
- **Idle reconciliation**: a device-local heartbeat (deliberately *not* gated on
  `visibilitychange` — a backgrounded tab while you work must not look like absence) lets the app
  propose "keep until 2:32 PM" instead of asking you to remember. The phase record still says the
  timer ran; the entry gets trimmed; they disagree, and that's the correct output.
- **CSV rewritten**: one row per real interval, each carrying its **own** start/end. Previously
  the session's window was repeated on every task row, so a 25-minute session across two tasks
  reported both as 25 minutes. Now adds `source`, `pomodoro_phase`, `phase_completed`, `edited`,
  `closed_by` and `original_*`.
- **Plan vs actual**: an "Actual" ribbon under the planned lanes (one lane suffices — recorded
  intervals never overlap, and the unbroken band *is* the proof), plus adherence %. Pleasing
  symmetry: the boundary-sweep from the deleted attribution survives, as a *comparison* rather
  than an *inference*.
- **Verified**: typecheck, lint, 384 tests, build, and a live two-container Docker run — a push
  from one "device" visible to a second, the CSV splitting 10 + 15 correctly, and an edited entry
  propagating with originals intact (the exact case `INSERT OR IGNORE` would have dropped).
- **Not verified**: a real browser session. No browser automation was available, so the rebuilt
  panel, the ribbon, the entry editor and the reconciliation dialog all want a real `npm run dev`
  click-through — in particular the hands-on check of dragging a timeline block *during* a focus
  phase and confirming the elapsed minutes do not move.
