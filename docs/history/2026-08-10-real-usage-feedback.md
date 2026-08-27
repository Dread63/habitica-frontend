# Real-usage feedback round (13 notes)

**When:** 2026-08-10

> Archived verbatim from the pre-2026-08-27 `CLAUDE.md`. References to sections
> "above" or "below" mean earlier/later rounds in `docs/history/README.md`.

---

Real-usage feedback round (13 notes from actually using the app day-to-day, 2026-08-10) — split
into items implemented immediately (no open design question) and four items where multiple
genuinely different implementations existed, settled via `AskUserQuestion` before writing code
(same discipline as the Phase 3/4 design checkpoints above):

- **New tasks land at the top of their list, durably.** `useCreateTask` (`taskMutations.ts`) now
  follows `POST /tasks/user` with `POST /tasks/:id/move/to/0` — `move/to` isn't just a local
  display trick, it persists the order server-side (confirmed in
  `docs/vendor/tasks.controller.js`), so it survives the next refetch/invalidation instead of
  reverting to wherever Habitica's API would otherwise have appended it.
- **Adding a subtask keeps the input open and refocuses on Enter** (`ChecklistSection.tsx`) instead
  of closing back to the "Add subtask" link — entering several in a row is now type/Enter/type/Enter.
- **Completed dailies/todos hide by default**, with a per-column "Show completed" toggle to bring
  them back (`taskVisibility.ts`, `Dashboard.tsx`/`TaskColumn.tsx`). Todos specifically: the
  default `/tasks/user` fetch omits completed todos server-side (confirmed in
  `docs/habitica-api.md`), so "show completed" there also gates a second request
  (`useCompletedTodos` in `useTasks.ts`) rather than just unhiding something already in hand.
  To-Dos also got a **"scheduled only" toggle** narrowing to todos with a due date.
- **Due dates now show** on daily/todo cards and the detail view (`taskDueDate.ts` — todos read
  `date`, dailies read the server-computed `nextDue[0]`, deliberately not re-derived
  client-side, same reasoning as `useScoreTask` not replicating streak math), with overdue todos
  flagged in the destructive color. A **"Sort by due date" toggle** (Dashboard, next to search)
  sorts dailies/todos ascending, due-less tasks last, stable otherwise.
- **Emoji shortcodes now render** (`src/lib/emoji.ts`, wrapping the `node-emoji` dependency) —
  Habitica's own editor lets you type `:tomato:` and renders it as 🍅; this app rendered the
  literal text until now. Shortcodes are converted to real Unicode first, then `useTwemoji` (as
  before) swaps that character for a consistently-rendered `<img>` — two independent steps.
  **Bundle cost, disclosed:** `node-emoji`'s shortcode data added roughly 65KB gzipped to the
  main chunk (223KB gzipped total now, was ~158KB after Phase 4) — worth revisiting (a smaller
  shortcode-only dataset, or lazy-loading it) if the >500KB chunk-size warning starts to matter
  more than it does today.
- **Fixed a real theming bug**, not just a preference: `ThemeProvider` used to add *no* `.light`/
  `.dark` class for the `'system'` preference, relying only on a `prefers-color-scheme` media
  query in `index.css` for the CSS custom properties. That covers color *tokens*, but every
  Tailwind `dark:` utility in the app (markdown's `dark:prose-invert`, etc.) compiles against the
  class-based `@custom-variant dark (&:where(.dark, .dark *))` — blind to the media query. Anyone
  on `'system'` whose OS was actually dark got correct background colors but light-mode text
  colors on top of them — this was the actual cause of "rendered markdown text is grey/dark blue
  and impossible to read," not a contrast tweak. `ThemeProvider` now always resolves `'system'`
  to an explicit class (and live-follows OS changes via `matchMedia`), so there's exactly one
  code path instead of two silently-diverging ones. The now-redundant parallel media-query block
  in `index.css` was removed.
- **Hotkeys:** `/` focuses task search, `n` focuses the quick-add bar (Dashboard.tsx) — ignored
  while typing anywhere or while any dialog is open, so they can never fire mid-sentence or leak
  behind a modal.
- **`window.confirm`/`window.prompt` replaced app-wide** with themed in-app dialogs
  (`components/ui/confirmStore.ts` + `ConfirmDialogHost.tsx`, and the `prompt` equivalent) —
  Zustand-backed singletons mounted once in `App.tsx`, called via `await confirmDialog({...})` /
  `await promptDialog({...})` from anywhere, the same way `window.confirm`/`window.prompt` were
  callable from anywhere. Used by task delete, tag rename/delete, and "save this filter" naming —
  every deliberate `window.*` placeholder called out earlier in this doc is now gone.
- **Layout reorg** (chosen over two alternatives via `AskUserQuestion`, then refined on user
  feedback about scaling — see below): Habits/Dailies/Rewards — short lists that used to each get
  a full top-level column — now render as collapsible sections in a left rail next to the tag
  filter (`TaskColumn.tsx`'s new `collapsible` prop, state in `railSectionsStore.ts`, persisted).
  To-Dos, the list that actually runs long, is the only remaining top-level column and gets the
  wide main area. **Scaling, addressed directly** (raised as a concern — ~10 habits + 5 dailies
  already, before this even ships): each rail section caps its list at `45dvh` with internal
  scroll once expanded, on top of its own collapse toggle; the whole rail is `lg:sticky` and caps
  at `calc(100dvh - 2rem)` with its own scrollbar, independent of the (now much taller) To-Dos
  column. A true multi-column card grid for To-Dos was considered and deliberately *not* built —
  CSS Grid gives variable-height cards equal row heights, which would leave visible gaps (not
  real masonry) without a JS layout library; To-Dos instead just gets more width, which already
  meaningfully helps line-wrap/scroll without that risk. Worth reconsidering if the plain wide
  column still feels long in practice.
- **"Proton Carbon" theme reskin** (`index.css`, `taskType.ts`, `TagChip.tsx`): primary accent
  changed from teal (read as "green" in menus/selection — direct feedback) to a violet
  (`#6d4aff` light / `#8d72ff` dark), neutrals shifted to near-black/off-white with a slight
  violet tint. Per-type accents (`taskType.ts`) were **re-derived, not just left alone**: reward
  used to be purple to match `taskColor.ts`'s Habitica-sourced "rewards are always purple"
  convention (that source, the card's left-border color, is untouched — vendor data, not
  approximated), but with `--primary` now also violet, two purple signals would've sat directly
  adjacent in the rail (Rewards next to To-Dos) with no way to tell them apart — reward is now
  gold/amber (Habitica's own currency color) instead, freeing the clash. Habit is blue, daily is
  rose. Dialog open/close animation got a gentle back-out easing (slight overshoot, close stays
  linear ease-out) — closer to habitica.com's own modal "pop" than the previous flat fade.
- **Detail view: bigger, and title/notes are editable in place** (chosen over two alternatives via
  `AskUserQuestion`): `components/ui/dialog.tsx` gained a `size="lg"` variant (`max-w-2xl`,
  `85vh` body cap) used by `TaskEditorDialog`. Inside the read-focused view (`TaskDetailView`),
  clicking the title or the rendered notes swaps that field to an editable input/textarea in
  place — save on blur/Enter, revert on Escape — rather than routing to the separate form. Only
  title/notes got this treatment (they're prose, being *written*); difficulty/tags/habit-daily-
  specific settings are selects/checkboxes and still make more sense as a structured form, reached
  via the (relabeled) "More fields" button. The `Due`/`Next due` detail-view row now also covers
  dailies, not just todos (reusing `taskDueDate.ts`).
- **Tag filter: chip click is a plain 2-state toggle, exclude is now a separate control** (chosen
  over two alternatives via `AskUserQuestion`) — replacing the neutral→included→excluded→neutral
  3-click cycle (`tagFilter.ts`'s `cycleTagInFilter`, now gone) with `toggleIncluded` (the chip
  body — the common case, one click either way) and `toggleExcluded` (`TagChip`'s small secondary
  `Ban`-icon button, for the rarer, deliberate exclude action). The underlying state shape
  (`included[]`/`mode`/`excluded[]`) is unchanged — this is the interaction layer's second
  redesign, not the data model's; see `tagFilter.ts`'s module comment for the full history.

**Not done, worth knowing about:** the `node-emoji` bundle-size cost (see the emoji note above)
was deliberately left as-is rather than half-solved — flagged rather than silently skipped.

