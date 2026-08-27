# Wide-layout round

**When:** 2026-08-10

> Archived verbatim from the pre-2026-08-27 `CLAUDE.md`. References to sections
> "above" or "below" mean earlier/later rounds in `docs/history/README.md`.

---

Wide-layout round (immediately after the above, same session — the app was capped at `max-w-7xl`
and left most of a wide monitor empty; four sub-decisions settled via `AskUserQuestion` first):

- **Full window width.** `Dashboard`'s `max-w-7xl` (1280px) cap is gone — the page is now
  `w-full` with padding. That cap was what made everything else here worth doing.
- **Wider rail, larger rail cards.** The rail went `lg:w-72` → `lg:w-80 xl:w-96`, and the
  Habits/Dailies/Rewards sections now hold genuinely readable cards rather than just fitting.
  Tags moved *below* the three task sections in the rail (they're an occasional control surface;
  the task lists are what you actually look at). Per-section scroll cap raised 45dvh → 55dvh.
- **`TodoBoard.tsx` — To-Dos spreads across multiple columns**, and is now its own component
  rather than another `TaskColumn` (it's the only list long enough to earn the wide main area;
  Habits/Dailies/Rewards stay on `TaskColumn` in the rail). Two modes, driven by the renamed
  `groupByDueDate` toggle in the header:
  - **Grouped:** four due-date buckets — Today & overdue / This week / Later / Someday —
    `xl:grid-cols-4`. Logic is pure and tested in `todoBuckets.ts` (13 tests), with `now`
    injected as a parameter rather than read from the clock inside, since every bucket boundary
    is date math with real edge cases (midnight, the 7-day cutoff) that's only testable if the
    caller controls "now". **Decisions that were settled explicitly, not guessed:** "this week"
    is a *rolling next 7 days*, not the calendar week (a calendar week leaves the column nearly
    empty every Saturday, useless exactly when you'd be weekend-planning); overdue and due-today
    share one bucket (same required response); undated todos get their own **Someday** column
    rather than being folded into Later (which would present them as scheduled) or hidden.
    Sort within each bucket is **due date ascending, then `value` ascending** — i.e. soonest
    first, ties broken by Habitica's aging scale so the reddest/longest-neglected card floats up.
  - **Ungrouped (default):** one continuous list flowed across `xl:columns-3`. **CSS multi-column,
    not a grid, on purpose** — multicol flows top-to-bottom *then* to the next column, preserving
    list reading order; a grid would instead place items 1/2/3 side-by-side across the first row.
    Cards get `break-inside-avoid` so none is split across a column boundary. Ungrouped is the
    default and applies **no sort at all**, which is what keeps "new tasks go to the top"
    (`useCreateTask`'s `move/to/0`) meaningful.
  - The one toggle also still sorts Dailies by `nextDue`, as the old "Due date" button did.
- **Task cards enlarged at comfortable density** (compact is untouched — that's its whole point):
  card padding `p-3` → `p-4`, title `text-sm` → `text-base`, notes `text-xs` → `text-sm`,
  metadata pills `text-[11px]` → `text-xs`. More importantly, **the controls got real hit
  targets**, which was the actual complaint: score buttons are now a padded `size-8` box around a
  `size-5` icon (were bare `size-3.5`/`size-4` icons), checklist tick/delete buttons are `size-7`
  boxes around `size-4.5`/`size-4` icons (were bare `size-3`), checklist rows have their own
  hover highlight, and the add-subtask input/button went `h-6` → `h-9`. `Indicator` takes an
  `isCompact` prop now so compact keeps the old tight sizing.
- **Removed the explanatory paragraph under the tag chips** — the two-control chip (click to
  include, `Ban` button to exclude) is discoverable from its tooltips; the block of text was
  permanent clutter for a one-time explanation.
- `TaskListSkeleton` was rewritten to mirror the new rail+board layout — it had gone stale
  against the old 4-equal-column design and would have caused exactly the layout jump it exists
  to prevent.

