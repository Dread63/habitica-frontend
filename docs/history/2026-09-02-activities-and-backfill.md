# 2026-09-02 — Ad-hoc activities, backfilling, and the drag/caret bug

Four fixes and two features, all driven by daily use of the app rather than by a plan.

## The notes field could not be clicked into

Reported as "I can't move the typing indicator inside the notes field of a task — it thinks I'm
dragging the card". Correct diagnosis, and the proposed fix (portal the notes editor) was the
obvious one and would not have worked.

`TodoBoard` wraps each card in a bare `draggable` div. Native HTML5 drag resolves its source by
walking up the **DOM tree**, so the mousedown that should place a caret starts a card drag.
`TaskCard` mounts its `TaskEditorDialog` *inside* the card, and although that dialog is a native
`<dialog>` opened with `showModal()` — which promotes it to the browser's top layer **for
painting** — `showModal()` does not move the element in the DOM. Portalling would have fixed that
one control while leaving the card's own "Add subtask" `<Input>`, which is in no dialog at all,
broken in exactly the same way.

The fix is at the drag source: `src/lib/dnd/dragGuard.ts` + `useDragGuard.ts`, spread onto all
three of the app's native drag sources. It clears `draggable` on a pointerdown that landed on
something interactive, and restores it on a **window**-level pointerup (a text selection started
in a card routinely ends with the pointer outside it; an element-level listener would leave the
card permanently undraggable).

The subtlety worth keeping: the check excludes the drag source *itself*. The unscheduled rail's
drag source is a `<button>`, so a boundary-less "is this interactive?" would have suppressed the
very drag it exists to protect. Nine unit tests, one of which is exactly that case.

Belt and braces: the attribute flip is what actually restores the caret (cancelling `dragstart`
afterwards does not), and a ref checked inside a wrapped `onDragStart` closes the re-render race.
The wrapper is explicit rather than a second capture-phase listener relying on `stopPropagation`
ordering to cancel the handler beside it.

## Short timeline blocks were unusable

The scrubber is horizontal, so duration maps to width. At the default 2.67 px/min a 15-minute
block is 40px and a 10-minute one hits the 28px floor — no room for a title, let alone two 24px
hover buttons.

Rejected: raising the floor permanently. A 10-minute block drawn 180px wide *at rest* overlaps the
next hour of the axis and misrepresents the day at a glance, which is the one thing the scrubber
must not do.

**First attempt, discarded after review:** the block rendered as a bare band and its contents moved
into a detached flyout below it. That threw away the title, and losing the title is worse than
losing the buttons — you read this timeline far more often than you click it.

**Built instead:** the block keeps its title at rest, clipped to whatever fits (which is how it
always worked, and narrow blocks now get their padding cut from `px-2.5` to `px-1` so more of it
fits). On hover or keyboard focus it **grows in place** to 180px, lifting above its neighbours,
until the title, the time range and both buttons fit. It grows rightward so the left edge — the
start time, the meaningful anchor — never moves; a block within 180px of midnight is nudged left
instead of being allowed to overflow the canvas and jog the horizontal scrollbar.

The subtlety that made this work at all: at rest a narrow block renders the action buttons **not
at all**, rather than at `opacity-0`. The opacity version reserves 48px of layout, which on a 40px
block is the entire thing — that reservation was the actual cause of the blank card. Hence
`BlockContents`' three-way `actions` prop (`hover` / `always` / `none`) rather than a boolean.

Wide and narrow render the *same* `BlockContents`; duplicating the button wiring for the narrow
case is precisely the thing that would have rotted.

Two things came along for free: the block is now `tabIndex={0}` and expands on focus, so those
buttons are keyboard-reachable for the first time; and for wide blocks the actions moved from
`hidden`/`group-hover:block` to opacity, which stops the title re-truncating on every hover.

The 28px resting floor was deliberately **not** raised. The band stays honest about its span, and
hover — not permanent extra width — is what makes a short one usable.

## Planned vs tracked, removed

The adherence percentage measured the wrong thing: finishing something faster than you blocked
out for it is usually a good outcome, and the number reported it as a shortfall.

A "time saved" replacement was considered and deliberately not built. To be honest it would have
had to count only tracking that ended *because the task was completed*, and no such distinction
exists — `useScoreTask` routes completion through `handleTaskDeleted`, landing as
`closedBy: 'user'`, indistinguishable from a manual stop. Adding `'completed'` is a clean
extension if it's ever wanted; it wasn't wanted enough to earn it now.

`planVsActual.ts` is deleted. Its surviving export `timeEntryToDayBand` moved into
`timeEntries.ts` beside `clipToDay` and `dayBounds`, where it always belonged — it's a projection
of one entry onto a day, not part of a comparison. **The Actual ribbon stays**; it's a view of the
ledger, and the backfill feature below turned it into the app's main repair surface.

## Ad-hoc activities

The driver: pausing a focus session to be IT support for forty minutes left the ledger with two
bad options — an overlong entry on the wrong task, or an untracked gap.

The decision that made this small is in `docs/architecture.md`: an activity is
`activity:<normalised label>` **in the existing `taskId` field**, not a new column and not a
nullable one. Everything treating that id as an opaque grouping key (`topTasks`,
`aggregateByCategory`, the lane packer, the CSV export, the sync merge) was untouched, and
everything resolving it to a live `Task` already had a snapshot fallback because completing a
to-do drops it from `GET /tasks/user`. **No persisted field changed shape**, so no store version
bump, no migration, and no server change — the api service stores opaque payloads and its record
kinds are fixed.

Deriving the id from the label is what makes two entries a week apart aggregate into one row with
no new aggregation code. The accepted cost: you cannot rename an activity. A different label is a
different subject.

There is **no activity store**. `recentActivities()` scans the ledger and the plan; label and tags
come from the most recent sighting, so re-tagging is just using it again. A registry would have
meant a fourth persisted store, a fifth sync record kind, an `api/` table, and definitions able to
drift out of step with the entries referencing them.

One invariant had to be relaxed, and missing it would have been a real data-loss bug: **one
placement per task per date does not apply to activities**. Two IT-support blocks in one day is a
real day, so `rescheduleEntry` skips its displacement step for activity ids, and `ScheduleFields`
grew an `entryId` prop to address one of several same-day blocks directly. Both are tested.

`TimeEntryTaskRef` was deleted and replaced by `TimeSubject` — they were structurally identical,
and one concept is better than two.

## Backfilling: `insertEntry`

The IT-support repair used to be split → split → retarget the middle → correct two end times: four
operations deep in a dialog, easy to get wrong in a way that silently invents or destroys minutes.

`insertEntry` does it in one. It carves the span out of whatever occupies it — trimming a
neighbour's end, advancing its start, splitting it in two, or deleting it with a tombstone —
dropping any sub-`MIN_ENTRY_MS` remnant rather than recording a three-second interval, and routing
trims through the same `withEdit` helper `editEntry` uses so a corrected neighbour still reports
what was captured live. Sixteen tests, each asserting `findOverlaps() === []` afterwards, plus
duration conservation across a split.

The case that took the most care: the **open** entry is carved like any other, measured to `now`,
and the piece still running to `now` stays open — so the at-most-one-open-entry invariant survives.
If the insert covers the open entry entirely, nothing is left open, which is the honest outcome.

New entries get `source: 'backfill'`, distinct from `'manual'`. Both are hand-started, but one was
recorded live and the other was typed in afterwards; that's a materially weaker claim and the CSV
already carries `source` out unchanged.

**The Actual ribbon is now the repair surface.** Clicking a band opens the interval editor on it;
clicking a gap opens it in `insert` mode prefilled with that span. Gaps are only offered up to
*now* on today — inviting a click on 9pm at lunchtime would be inviting a log of the future.

## Search on the timeline

The unscheduled rail was an unsearchable wall of every schedulable task, and `PomodoroPanel` had a
native `<select>` of every focusable one.

Both now use the Dashboard's engine verbatim — `searchTasks` and `TaskSearchBar`, unmodified — so
finding a task means the same thing everywhere rather than being a second, subtly different
search. Activities get their own group, matched on their label only; claiming the same
title → subtask → notes tiers for something that has only a label would be dishonest.

A query matching no task and no existing activity offers to schedule itself as a new one. That is
the entire "create an activity" flow — no separate dialog, no registry screen.

`SubjectPicker` is one searchable combobox over tasks + activities + "create it", and it replaced
all three of the app's subject pickers (the pomodoro select, the interval editor's task select,
and the new activity chooser). It also means you can now point the clock at an activity **live**,
not only backfill one afterwards.

## Verified

`npm run typecheck && npm run lint && npm test && npm run build` — clean, 439 tests passing (up
from 384), production build succeeds. The >500KB chunk warning is pre-existing and deliberate.

## Not verified

- **Everything rendered.** No browser automation has ever been available in this project. The drag
  guard, the hover-expansion of short blocks (including the midnight-edge nudge), the ribbon's
  clickable bands and gaps, `SubjectPicker`'s dropdown behaviour, and the rewritten unscheduled
  rail were all reasoned through, not clicked through.
- The drag-guard fix in particular is a **browser-behaviour** fix. `shouldSuppressDrag` is unit
  tested against real jsdom nodes, but "the caret now lands where you clicked" can only be
  confirmed in a real browser, and ideally in both Chrome and Firefox — Firefox is where the
  ancestor-draggable interference is worst.
- No round-trip against a real Habitica account. Nothing here touches `lib/habitica/`, so the risk
  is low, but it remains untested.
- No multi-device sync session with an activity in it. The shape rides through the existing
  opaque-payload path with no protocol change, so this is expected to be uneventful — but expected
  is not verified.
