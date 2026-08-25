# Habitica Frontend — project context

A self-hosted, Docker-deployed alternative frontend for Habitica: dark mode, a modernized
layout, and a real tag filter engine (include-any / require-all / exclude — Habitica's own
frontend only supports AND-only include). Full design rationale: `docs/implementation-plan.md`.

## Status

**Phase 0 through 4 are done** — the full §6a backlog (quick-add bar, reward/XP feedback,
detail view, compact density) plus loading/empty-state polish — **and so are a post-Phase-4
fixes round, a visual/responsive design pass, a real-usage feedback round, a wide-layout pass,
a due-date round, and Phase 6 (Docker), now actually verified against a real daemon** (13 notes
from actually using the app day-to-day, then a further list specifically about dates: a real
timezone bug fix, drag-and-drop between due-date buckets, quick-add `@date` shorthand, a themed
`DatePicker` replacing the native browser one, due-date grouping as the default view, then a real
`docker compose up --build` run that found and fixed a genuine `HEALTHCHECK` bug). Search
"Post-Phase-4 fixes", "Visual/responsive design pass", "Real-usage feedback round",
"Wide-layout round", "Due-date round", and "Phase 6 — Docker, actually verified" below for the
details. **A Timeline + Pomodoro round followed (2026-08-25)** — a `/timeline` tab (per-day
horizontal drag-and-drop schedule with overlap lanes and a real-time now line), right-click
send-to-timeline on task cards, timeline scheduling in the editor, and a task-linked pomodoro
timer with tag-curated category stats, all app-local (never sent to Habitica) — see "Timeline +
Pomodoro round" below — **then a revision round on it the same day** (a real "Deleted task" bug
on completing a scheduled to-do, manual phase advance with chime/notification, proportional
per-task focus attribution computed from the timeline, color-coded stats, start→end scheduling,
block-click detail view — see "Timeline + Pomodoro revision round").
Phase 5 (party/guilds/chat/market — optional, separately scoped) is the
only phase-sized work left; Phase 6's remaining scope is a packaging decision (multi-arch build,
versioned tags, a registry to publish to), not a correctness gap. See
`docs/implementation-plan.md` §6 for the full phase breakdown.

**Docker is now verified** (see "Phase 6 — Docker, actually verified" below for the full
checklist and the `HEALTHCHECK` bug it found and fixed). What's left to do on a machine with a
real Habitica account:
1. `cp .env.example .env` (if you don't already have one), set `VITE_HABITICA_CLIENT_ID` to
   `<your-habitica-user-id>-habitica-modern-frontend`
2. `docker compose up --build`, then actually log in — the one thing that still hasn't been
   checked end-to-end is auth against the real Habitica API from inside the container (everything
   else — build, healthcheck, SPA fallback, asset caching — has been)
3. From there: multi-arch build / versioned tags / a registry to publish to is the remaining
   Phase 6 scope (a packaging decision, not a correctness fix) — or just start using the app daily
   and let real usage surface what's actually missing before committing to Phase 5.

What Phase 0 established:
- **CORS is open** on the Habitica API (`access-control-allow-origin: *`, verified via a live
  `OPTIONS` request — see `docs/habitica-api.md`). This confirms the architecture: **no backend
  needed**, the SPA calls `habitica.com/api/v3` directly from the browser.
- API docs vendored into `docs/` so nothing needs a live fetch against `apidoc.habitica.com`
  (which doesn't render for tools anyway — see below).

What Phase 1 built:
- Vite + React 19 + TypeScript app scaffolded at the repo root (`src/`), Tailwind v4 wired via
  `@tailwindcss/vite` (no PostCSS config needed), path alias `@/*` → `src/*`.
- `src/lib/habitica/` — the API client (`client.ts`), a sliding-window rate limiter
  (`rateLimiter.ts`, unit-tested in `rateLimiter.test.ts`) that queues rather than drops requests
  and backs off on `429` using `Retry-After`, credential storage (`auth.ts`), and types matching
  `docs/habitica-api.md` exactly (`types.ts`).
- `src/features/auth/` — `AuthProvider` (verifies credentials against `GET /user` before ever
  persisting them), `LoginScreen`, `RequireAuth` route guard.
- `src/features/theme/` — three-state (light/dark/system) `ThemeProvider` + `ThemeToggle`, tokens
  in `src/index.css` as CSS custom properties (`@theme inline` mapping for Tailwind v4).
- `src/features/tasks/` — `useTasks`/`useTags` (TanStack Query), `TaskCard`/`TaskColumn`/
  `Dashboard`. **Read-only** — indicators show state (completed, streak, up/down) but nothing is
  wired to score/edit yet; that's Phase 2.
- `src/components/ui/` — hand-authored `button.tsx`/`card.tsx`/`input.tsx` following shadcn/ui's
  cva + `cn()` conventions (not scaffolded via the shadcn CLI, to avoid an interactive-prompt
  dependency during automated builds). `npx shadcn@latest add <x>` can add official components
  later without conflict — they share the same pattern.
- `Dockerfile` (multi-stage, `nginx:1.27-alpine`), `nginx.conf` (SPA fallback, immutable caching
  on hashed assets, `/healthz`), `docker-compose.yml`, `.env.example`.
- **Verified:** `npm run typecheck`, `npm test`, `npm run build`, `npm run lint`, and a
  `vite preview` smoke test all pass clean. **Not verified:** the actual `docker build` —
  Docker isn't available in the sandbox this was built in. Run `docker compose up --build`
  yourself before trusting the image; the Dockerfile/compose/nginx.conf are correct by inspection
  but that's not the same as a real build.

Phase 1 follow-up fixes (found via a real UI check, not originally scoped tightly enough):
- `src/features/tasks/taskColor.ts` — Habitica's task-aging color scale (`value` → worst/worse/
  bad/neutral/good/better/best/purple), ported from `docs/vendor/task-color.getter.js` with exact
  hex values from `docs/vendor/task-colors.scss` + `task-style.scss` — not approximated. Shown as
  a `TaskCard` left-border accent. 16 unit tests cover every bucket boundary.
- Checklist/subtask items now render on `TaskCard` (they didn't at all before).
- `task.notes` now renders as Markdown (`react-markdown` + `remark-gfm` +
  `@tailwindcss/typography`'s `prose` classes) instead of plain text — matches Habitica's own
  behavior (they ship a `markdown.scss`, vendored proof it's real, not assumed).
- Emoji now render via `@twemoji/api` (`src/lib/useTwemoji.ts`), applied to task text, notes, and
  checklist items. **This is a deliberate external dependency** — Twemoji fetches emoji images
  from jsdelivr's CDN, because a self-hosted app can't assume the host OS/browser has a
  color-emoji font installed (this was the actual root cause: no CSS font-stack trick fixes a
  genuinely absent emoji font). If that CDN dependency is unwanted later, vendor the Twemoji SVG
  set into `public/twemoji/` and point `useTwemoji`'s `base` option at it — noted here so it
  isn't silently forgotten.

What Phase 2 built (scoring, create/edit/delete, checklist interactions):
- `src/features/tasks/taskMutations.ts` — all task mutations. **Scoring is optimistic + always
  reconciled**: `useScoreTask` flips `completed` locally on click for instant feedback, then
  *always* invalidates `['tasks']` on settle rather than trying to replicate Habitica's
  streak/history/`nextDue` math client-side — that logic is non-trivial (cron/day-start
  dependent) and getting it subtly wrong would be worse than one extra fetch. Every other
  mutation (create/update/checklist add/score/delete) adopts the response directly into the
  TanStack Query cache via `setQueryData`, confirmed from `vendor/tasks.controller.js` to
  actually return the updated task — delete is the one exception (`{}` response), handled with
  optimistic removal + rollback on error instead.
- `src/features/tasks/TaskEditorDialog.tsx` — shared create/edit form, built on a hand-authored
  `<dialog>`-based `src/components/ui/dialog.tsx` (native focus trap/Esc/backdrop, no Radix
  dependency). Covers text/notes/priority/tags for all types, plus habit up/down, daily
  frequency+everyX+weekly repeat days, todo due date, reward gold cost. **Known gap:** monthly/
  yearly daily scheduling (`daysOfMonth`/`weeksOfMonth`) isn't in the form — created dailies get
  Habitica's default for those frequencies. Flagged in the UI, not silently dropped.
- Checklist add/toggle/delete wired into `TaskCard`'s `ChecklistSection`.
- Delete confirmation uses `window.confirm` — a deliberate placeholder, not a real modal; revisit
  in Phase 4 if the native browser dialog feels out of place next to the rest of the redesign.
- Habit up/down, daily/todo complete-toggle, and reward-buy are all live now — no gold-balance
  check before letting a reward purchase attempt fire (the server will 400 on insufficient gold;
  Phase 4 candidate: show the user's actual gold and disable affordable-check client-side).

What Phase 3 built (the tag filter engine — the feature this project exists for):
- `src/features/tags/tagFilter.ts` — the pure matching logic, plus `cycleTagInFilter` (neutral →
  included → excluded → neutral state transitions) and `removeTagFromFilter`. 29 unit tests,
  written before any UI touched it, same discipline as `taskColor.ts` in Phase 1.
- `src/features/tags/tagFilterStore.ts` — **first real use of Zustand** (installed since Phase 1
  but unused until now; theme/auth used plain Context instead, since they didn't need Zustand's
  `persist` middleware or multi-field update actions the way filter state + presets do).
  Persisted to `localStorage` under `habitica-frontend:tag-filter`.
- `src/features/tags/tagMutations.ts` — tag create/rename/delete/reorder. Delete mirrors
  Habitica's server-side cascade locally (strips the tag from cached tasks) and calls the store's
  `pruneTag()` so a deleted tag can't linger in the active filter or a saved preset.
- `src/features/tags/TagChip.tsx` / `TagFilterSidebar.tsx` / `TagManagerDialog.tsx` — chip click
  cycles include/exclude state; a **separate, explicit "Match any / Match all" toggle** governs
  how included tags combine — this app's own convention, not Habitica's (they have no equivalent
  feature). Tag administration lives in a **separate** dialog rather than hover-icons on the
  chips, so the two interactions don't compete for the same click target. Preset naming uses
  `window.prompt` — same deliberate-placeholder pattern as the delete confirmations elsewhere,
  real UI to follow in Phase 4.
- **Redesigned once already, post-ship** — the first version used three independent per-tag
  buckets (anyOf/allOf/noneOf, green/blue/red chips). Testing found a real UX flaw: with only one
  tag in a bucket, an OR-group and an AND-group are identical, so a green chip and a blue chip
  looked like they did the same thing until a second tag got added to one of them. Replaced with
  the single-mode model described above. Full rationale: `docs/implementation-plan.md` §4. If
  you're reading old context (an earlier commit message, a stale mental model) that mentions
  `anyOf`/`allOf`/`noneOf` or per-tag AND/OR colors, it's describing the superseded design —
  `tagFilter.ts` as it exists now is the source of truth.
- `Dashboard` now renders `TagFilterSidebar` beside the four columns and filters
  `tasksQuery.data` through `filterTasksByTags()` before grouping by type — per-column counts
  reflect the filtered set for free, no extra wiring needed.
- **Bundle size note:** the production build now warns about a >500KB JS chunk (was under 500KB
  through Phase 2). Not a problem yet (~158KB gzipped after Phase 4), but if it keeps growing —
  Phase 5's scope in particular — code-splitting (lazy-load dialogs, split vendor chunks) is worth
  revisiting rather than ignoring the warning indefinitely.

What Phase 4 built (the full §6a backlog, syntax/architecture confirmed with the user via
AskUserQuestion before writing any code — same lesson as the tag-filter rework: settle design
questions before implementing, not after):

- **Quick-add bar** (`src/features/tasks/quickAdd.ts` + `QuickAddBar.tsx`) — one input above the
  columns, not per-category floating dialogs. Shorthand: `#tag` (repeatable, auto-creates the tag
  if it doesn't exist yet), `/habit` `/daily` `/todo` `/reward` (defaults to todo), `!`/`!!`/`~`
  for medium/hard/trivial (defaults to easy). Pure tokenizer (`parseQuickAdd`), 25 tests including
  the tricky edge cases — a trailing `!` glued to a word is never mistaken for the difficulty
  marker, an unrecognized `/word` is left in the text rather than silently eaten. Live preview
  line under the input shows the parsed type/difficulty/tags as you type. New tags resolve
  sequentially (not `Promise.all`) so two `#same-tag` mentions in one input reuse the tag just
  created instead of racing two creates for the same name.
- **Reward/XP feedback on scoring** — new `src/features/user/useUser.ts` (`GET /user?userFields=`,
  the Phase 0 finding, cached under `['user']`), kept in sync by `useScoreTask`'s `onSuccess`.
  `TaskCard` snapshots stats *before* scoring, diffs against the response, and shows a small
  fading "+3 XP · +1 GP" badge (`ScoreFlash`) near the scored control.
  **Known subtlety handled deliberately:** exp resets on level-up, so a raw before/after diff
  would show a large nonsensical negative number right when you level up — `expGained` is
  `undefined` (not shown) whenever `leveledUp` is true, and "Level up!" is shown instead. Also
  added: the header shows current level/gold, and reward-buy buttons disable with a tooltip when
  unaffordable (both were "Phase 4 candidate" notes left in Phase 2, now built).
- **Expandable detail view** — `TaskEditorDialog` gained a `view`/`form` sub-state for edit mode
  (create mode still always opens straight to the form). Clicking a card's title/notes opens
  `view` (full-width rendered markdown, full interactive checklist, a metadata `<dl>`, an Edit
  button); the pencil icon jumps straight to `form`. `ChecklistSection`/`ChecklistItemRow` were
  extracted out of `TaskCard.tsx` into their own file specifically so both the compact card and
  the detail view render the *same* interactive checklist rather than a second, divergent
  read-only copy. **HTML-nesting gotcha worth remembering:** markdown notes can contain links, and
  `<a>` can't legally nest inside `<button>` — so only the task title is a real `<button>`
  (keyboard-accessible); the notes preview is a plain `<div>` with its own `onClick`, guarded to
  skip opening the dialog when the click landed on a link (`event.target.closest('a')`).
- **Compact density toggle** — `src/features/theme/DensityProvider.tsx` + `DensityToggle.tsx`.
  Deliberately *not* the same three-state shape as `ThemeProvider`: density has no OS-level signal
  to fall back to (no `prefers-density`), so it's a plain two-state (`comfortable`/`compact`)
  toggle, and since nothing about density needs a CSS custom-property cascade, there's no root
  class applied either — components just read `useDensity()` directly. Compact mode: tighter
  card padding/gaps, notes preview hidden entirely (full notes are one click away via the detail
  view), checklist collapses to just the "X/Y subtasks" count (`ChecklistSection`'s `summaryOnly`
  prop).
- **Loading/empty/error state polish** — `TaskListSkeleton` mirrors the real sidebar+columns
  layout (no layout jump when data arrives) instead of bare "Loading tasks…" text; the error state
  gained a "Try again" button wired to `tasksQuery.refetch()`; empty columns are now a clickable
  dashed-border prompt that opens that column's create dialog directly, instead of static
  "Nothing here." text.

Post-Phase-4 fixes from real-world testing:
- **Quick-add now supports multi-word tag names** (`quickAdd.ts`) — the bare `#tag` form only ever
  matched `[a-zA-Z0-9_-]+`, so a real tag like "Life + Admin" (spaces, a `+`) couldn't be typed at
  all. Added a quoted form, `#"Life + Admin"`, alongside the bare form; either can repeat and mix
  freely in one input. An unterminated `#"` (no closing quote) is deliberately left as literal
  text rather than guessed at — see `quickAdd.test.ts`'s dedicated describe block.
- **Task search** (`src/features/tasks/taskSearch.ts` + `TaskSearchBar.tsx`) — a separate input
  stacked directly below `QuickAddBar` (deliberately not the same field: quick-add's Enter key
  creates a task, and overloading that with search's Enter behavior would be ambiguous).
  Case-insensitive substring match against task title, any checklist/subtask item's text, and
  notes; a task matching more than one of those reports only its *highest* tier. Results within
  each column are sorted title-matches first, then checklist-matches, then notes-only matches,
  ties keeping their original order (relies on `Array.sort` being stable, ES2019+). Composed in
  `Dashboard.tsx` *after* `filterTasksByTags()` — tag filter narrows the set, search narrows and
  reorders what's left — and an empty/whitespace query is a total no-op (returns the same array
  reference, no reorder), so search is invisible until you actually type something.
  `TaskColumn` takes a new `isFiltered` prop (true when either the tag filter or the search query
  is active) so a column filtered/searched to zero results shows a plain "No matches." instead of
  the normal empty-column "Nothing here — add one" prompt, which would otherwise misleadingly
  suggest the column has no tasks at all.

Visual/responsive design pass (the item left open at the end of Phase 4):
- **Per-type visual identity** (`src/features/tasks/taskType.ts`) — a small icon+color table, one
  entry per task type, deliberately a *second, separate* color system from `taskColor.ts`'s
  per-task "value" aging scale (the card's left-border accent, unchanged). Type accents only ever
  appear in column headers (icon + a faint colored underline), the quick-add bar's live preview,
  and the editor dialog's title — never on the card body — so the two systems are never adjacent
  and can't be misread as conflicting signals about the same task. Colors aren't arbitrary: `todo`
  reuses `--primary` (quick-add already defaults to todo, so this says "todo is the default,
  central list"), `reward` is purple to match `taskColor.ts`'s existing convention that reward
  cards are always purple; `habit` (indigo) and `daily` (sky) round out four hues distinct from
  each other. `components/ui/dialog.tsx` gained an optional `icon` prop to carry this into dialog
  titles.
- **Fixed a real responsive bug**, not just added polish: `Dashboard`'s sidebar+columns and the
  4-column row both switched to `flex-row` at the *same* `sm:` (640px) breakpoint, so at any
  tablet-ish width (640–1023px) all 5 (56px sidebar + 4 columns) ended up crammed into one row,
  each column far too narrow to be usable. Fixed by decoupling the two: the sidebar now joins the
  columns in a row only at `lg:` (1024px), and the columns themselves are a responsive CSS grid
  independent of the sidebar — `grid-cols-1` (phone) → `sm:grid-cols-2` (tablet, 2×2) →
  `xl:grid-cols-4` (desktop, the original 4-across layout). Header also gained `flex-wrap` so the
  title/level/gold group and the icon-button group don't overflow on very narrow widths.
  **Caveat, stated plainly:** this was fixed by inspection/reasoning about the breakpoints, not
  verified against a real narrow-viewport browser session — no Playwright/browser-automation tool
  was available in the sandbox this was built in (same honesty convention as the untested Docker
  build). Worth an actual on-device check before considering it fully closed.
- **Animation/transition polish**, all respecting `prefers-reduced-motion` (the existing global
  media query in `index.css`, extended to also cover `::backdrop` since `*` doesn't match
  pseudo-elements):
  - Native `<dialog>` open/close now fades+scales via `@starting-style` / `transition-behavior:
    allow-discrete` (the `.app-dialog` class in `index.css`) — plain CSS rather than Tailwind's
    `open:`/`starting:` variants, since the nesting needed is fiddly to express as utilities.
    Requires a 2023/2024-era browser (Chrome 117+/Firefox 129+/Safari 17.4+); older browsers just
    get an instant open/close, no functional loss.
  - New task cards fade/slide in on mount (`@keyframes task-in`) — since cards are keyed by
    `task.id`, this only plays for genuinely new tasks, not ones merely reordering from search/
    filter (React reuses the DOM node for a key match, so no animation fires on reorder).
  - `Button`, `TagChip`, and the raw score-control buttons in `TaskCard` all get a quick
    `active:scale-9x` press animation for tactile feedback; `TaskCard` itself gets a subtle
    `hover:shadow-md` lift.

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

Due-date round (immediately after the above, same day — a real timezone bug plus a due-date
feature request list: proper drag-and-drop, quick-add date shorthand, a themed date picker, and
due-date sorting as the default):

- **Fixed a real, confirmed timezone bug** — "set a task due tomorrow the 18th, it shows due
  today the 17th" — **and then fixed it again, correctly, after the first fix turned out to
  address the wrong half of it.** Worth recording both attempts, not just the final state:
  - *First pass (wrong half):* traced through Habitica's own source (`docs/vendor/task.model.js`)
    that a todo's `date` is a plain Mongoose `Date`, and that this app was sending a bare
    `"YYYY-MM-DD"` string, which per the ECMAScript spec is parsed as **UTC midnight** — so a todo
    "due 2026-08-18" was stored as exactly `2026-08-18T00:00:00.000Z`. Reading that back with
    *local* `Date` methods rolls it back a day for anyone west of UTC (reproduced against this
    app's own code in `America/Denver`). The fix applied at the time changed `getDueDate` to read
    a todo's `date` via its **UTC** components instead — which made this app's *own* display
    self-consistent, but didn't touch what got *sent*.
  - *What that missed:* a user then created a task via quick-add and checked the result on
    **habitica.com itself** — still wrong there too. That's the tell: the bug was in what this app
    sent, not how it read the result back. habitica.com's own frontend, like any ordinary JS date
    picker, sends a real timestamp for *local* midnight and reads it back with plain local `Date`
    methods — this app's bare-date-string write was internally self-consistent but incompatible
    with Habitica's own convention.
  - *Actual fix:* moved to the write side. `lib/dateOnly.ts`'s `toApiDateTime(date)` (just
    `date.toISOString()`, but named and centralized specifically so this rule has one obvious home)
    is now used everywhere this app sets a due date — `TaskEditorDialog`'s `toInput`, `QuickAddBar`,
    `TodoBoard`'s drag-and-drop. `getDueDate` in `taskDueDate.ts` went back to a plain `new
    Date(task.date)` — the UTC-component read was reverted, not layered on top, since it's wrong
    once the write side is correct (right by coincidence only for timezones behind UTC, wrong east
    of it). Footgun #9 in `docs/habitica-api.md` was rewritten to match, not left describing the
    superseded diagnosis.
  - Compounding half of the same bug, still fixed and still correct: `isOverdue` used to compare a
    raw due-midnight timestamp against `Date.now()`, flagging anything due *today* as overdue the
    instant the clock passed midnight — it compares calendar days now (due day strictly before
    today).
  - **Lesson applied going forward, not just noted**: a self-consistent fix within this app's own
    round-trip isn't the same as a *correct* one — this app is a frontend for a real external
    system, and "does it look right in this app" isn't sufficient verification for anything that
    round-trips through Habitica's own storage and (critically) its own frontend. The tests in
    `taskDueDate.test.ts` now assert the write→read round-trip via `toApiDateTime`/`getDueDate`
    together across five real timezones, not `getDueDate`'s internals in isolation — the round-trip
    is the thing that actually matters.
- **`src/lib/dateOnly.ts`** — general-purpose "calendar date" utilities (`today`, `startOfDay`,
  `addDays`, `addMonths`, `toDateOnlyString`, `parseDateOnlyString`, `isSameDate`), all operating
  in the *local* calendar, plus the one deliberate exception: `toApiDateTime`, for the one place
  this app is supposed to produce a real UTC instant (talking to Habitica's `date` field) rather
  than staying in local-calendar-string land. Every other date-handling piece in this round
  (`DatePicker`, quick-add `@date` tokens, drag-and-drop) is built on these. 22 tests.
- **`components/ui/DatePicker.tsx`** — a themed calendar dropdown replacing the native
  `<input type="date">` in `TaskEditorDialog` (a direct complaint: the native picker can't be
  restyled to match the rest of the app). Exports `CalendarGrid` (month nav + day grid, no
  trigger/input chrome) separately from `DatePicker` (trigger button + popover wrapping it) so the
  bare grid can be reused standalone — see drag-and-drop below. `TaskEditorDialog`'s `toInput` was
  also fixed alongside this: it used to only set `date` in the request body when truthy, so
  clearing a todo's due date in the form silently did nothing (PUT only touches fields it's
  actually given) — `CreateTaskInput`/`UpdateTaskInput.date` is now typed `string | null` and
  `null` is sent explicitly to clear.
- **Quick-add `@date` shorthand** (`quickAdd.ts`) — `@today`, `@tomorrow`, a weekday name/
  abbreviation (`@friday`/`@fri` — resolves to the *next* occurrence, inclusive of today: naming
  today's own weekday means today, matching Todoist's convention for the same ambiguity), or an
  explicit `@8/11`, `@8/11/26`, `@8/11/2026`. A bare `@M/D` with no year assumes the current year
  unless that date has already passed, in which case it rolls to next year (typing "@1/5" in
  December almost certainly means next January). `parseQuickAdd` now takes an optional `now`
  parameter (defaulting to the real clock) purely for this — same pattern as `todoBuckets.ts`'s
  `bucketOf`. An unrecognized `@word` (including an `@`-glued email address, which never even
  matches the token boundary) is left as literal text, same treatment as an unrecognized `/word`.
  20 new tests. `QuickAddBar`'s live preview line gained a date chip; the created task always
  includes `date` when parsed (Habitica ignores it for non-todo types per the existing footgun
  list, so no type-gating needed).
- **Drag-and-drop between due-date buckets** (`TodoBoard.tsx`) — grouped view only (buckets only
  exist there). Native HTML5 drag-and-drop, no dependency: drop on Today & overdue → due today;
  drop on This week → due in exactly 7 days from today (not "sometime this rolling week" — a card
  dropped in on a Saturday would get almost no runway under that reading); drop on Someday →
  clears the due date; drop on Later → opens a small floating popover (the bare `CalendarGrid`
  from `DatePicker.tsx`, pinned near the drop point) to pick a specific date, since no fixed
  offset makes sense for "later". A card already in the bucket it's dropped on (except Later,
  which always reopens the picker) is a no-op — no pointless PUT. **Disclosed limitation, not
  silently accepted**: native HTML5 DnD is mouse/trackpad-only — no touch-screen support without a
  polyfill (not built), and no keyboard equivalent. Not a dead end either way: every card's pencil
  icon still opens the full editor with the same `DatePicker`, so drag-and-drop is a shortcut on
  an already-fully-accessible path, not the only way to set a due date.
- **Due-date grouping is now the default** (`Dashboard.tsx`'s `groupByDueDate` starts `true`,
  was `false`) — per explicit request that due-date sorting be the default view. `TaskListSkeleton`
  updated to mirror the four-bucket grouped layout instead of the flowed-list ungrouped one, since
  that's what most loads will actually show now.
- **Found and fixed a second real bug while chasing the date report above**: a user also reported
  that a newly-created task "shows on habitica.com but not in our app." Root cause:
  `useCreateTask`'s `mutationFn` (`taskMutations.ts`) awaited *two* sequential API calls — create,
  then the `move/to/0` reordering call from the earlier "new tasks go to the top" round — with no
  error handling around the second one. Any failure there (a 429 outlasting the rate limiter's
  retries, a transient network blip, anything) rejected the *whole* mutation, so `onSuccess` never
  ran and a task that genuinely existed server-side never made it into the local cache. Fixed by
  wrapping the `move/to/0` call in its own `try/catch` — reordering is a nice-to-have on top of a
  successful create, not a condition of the task showing up at all.

Phase 6 — Docker, actually verified (immediately after the due-date round, same session — a real
Docker daemon (OrbStack, macOS host) became available, so the "never actually run" gap flagged
since Phase 1 finally got closed instead of staying a permanent caveat):

- **`docker compose up --build` was run for real** and the multi-stage build completes cleanly
  (`node:22-alpine` → `nginx:1.27-alpine`, ~78MB final image). `/healthz` responds `ok`, `/` and a
  client-routed path both return `200` with `index.html` (confirming `nginx.conf`'s SPA fallback
  actually works, not just reads correctly), and hashed assets serve with the intended
  `Cache-Control: immutable` while `index.html` stays `no-cache`.
- **Found and fixed a real bug in the process**: the container's own `HEALTHCHECK` (`wget -qO-
  http://localhost/healthz`) failed on *every single probe* with "connection refused" —
  permanently reporting the container `unhealthy` in `docker ps`/`docker inspect`, despite the app
  working completely fine from outside on the mapped host port. Root cause, confirmed by
  `docker exec`-ing in: busybox `wget` resolves `localhost` to `::1` (IPv6) first (`getent hosts
  localhost` confirms it), but nginx's plain `listen 80;` in `nginx.conf` only binds the IPv4
  wildcard on this image/kernel — so the probe connects to a port nothing is listening on.
  `curl`ing `127.0.0.1` (bypassing the IPv6 resolution) worked immediately. Fixed by pointing the
  `HEALTHCHECK` at `127.0.0.1` explicitly (`Dockerfile`) rather than depending on `localhost`'s
  resolution order — the standard fix for this well-known class of container healthcheck bug.
  Rebuilt and re-verified: `docker ps` now reports `(healthy)` on the very first probe. This is
  exactly the kind of bug that can only be found by actually running the container, not by
  inspection — it had been sitting in the Dockerfile since Phase 1.
- **Not verified**: logging in against a real Habitica account end-to-end. Everything above was
  checked without live credentials in the loop (this session never had a real Habitica user ID/API
  token) — it exercises `src/lib/habitica/client.ts` against the real API, not anything
  Docker-specific, so it's a meaningfully separate check from what's covered here.
- **Still open, and deliberately not decided here**: multi-arch build, versioned tags, and a
  registry to actually publish images to. That's a packaging/release decision (Docker Hub? GHCR?
  self-hosted registry? a version scheme?) that wasn't asked for and shouldn't be assumed — flagged
  as the remaining Phase 6 scope rather than silently built.
- The verification container ran on `HOST_PORT=8081` (an env-var override on the `docker compose
  up` invocation, not a change to the repo's `.env` — port 8080 was already in use by an unrelated
  container on this machine) and was torn down (`docker compose down`) after confirming healthy,
  rather than left running. `.env` itself was left untouched — it already existed with the
  placeholder `VITE_HABITICA_CLIENT_ID` from `.env.example`, still needs the real value set before
  this is used for anything but a build/serve smoke test.

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

## Architecture (decided, don't re-litigate without reason)

- **No custom backend.** Static SPA, built and served by `nginx:alpine` in a single
  docker-compose service. The user's Habitica API credentials live in browser storage; this app
  never proxies or stores them server-side.
- **Stack:** React + TypeScript + Vite, TanStack Query (data fetching/caching — its retry/backoff
  maps directly onto Habitica's rate limit), Tailwind + shadcn/ui (theming/components), Zustand
  (small local UI state — filter buckets, theme choice).
- Full rationale and the Docker/compose skeleton: `docs/implementation-plan.md` §1–3, §7.

## Where things are

| Need | File |
|---|---|
| Why this architecture, tech stack, phased roadmap | `docs/implementation-plan.md` |
| **API reference — read this before writing any Habitica API code** | `docs/habitica-api.md` |
| Real example JSON responses (task/tag CRUD, scoring) | `docs/api-examples/*.json` |
| Script to capture your own fresh examples from a real account | `docs/api-examples/capture-fresh-examples.sh` |
| Ground-truth Mongoose schemas + route source (only needed if `habitica-api.md` doesn't cover it) | `docs/vendor/` |
| Full community OpenAPI spec | `docs/vendor/openapi.yaml` |

**Never fetch `apidoc.habitica.com` directly** — confirmed firsthand it's a client-rendered SPA
that returns `"Loading..."` to `WebFetch` and most non-browser tools. Everything needed from it
is already vendored into `docs/`. If something's genuinely missing, fetch raw source from
`raw.githubusercontent.com/HabitRPG/habitica/develop/website/server/...` instead — that URL
pattern works fine with fetch tools.

## The feature that matters most: tag filtering — built in Phase 3

Habitica's own frontend filters tasks by tag with AND-only, include-only logic. This project's
whole reason to exist (alongside the redesign) is replacing that — **live now**, in
`src/features/tags/`:

- `included: string[]` — the selected tags
- `mode: 'any' | 'all'` — one explicit switch controlling whether `included` combines with OR or
  AND (deliberately *not* encoded per-tag — see the redesign note above for why)
- `excluded: string[]` — tasks carrying any of these are hidden, regardless of `mode`

Pure client-side filter over the already-fetched task array (`tagFilter.ts`) — `GET /tasks/user`
has no tag query param and never will (confirmed in `docs/habitica-api.md`), so there was never
any API interaction to design here, only correct, well-tested filtering logic. 29 tests in
`tagFilter.test.ts`, including a named regression test for the 1-tag-makes-any/all-identical case
that caused the redesign, and a defensive case for a tag landing in both `included` and
`excluded` (shouldn't happen via the normal chip-click cycle, but the matcher guards it anyway —
exclusion wins). Full spec incl. the revision history: `docs/implementation-plan.md` §4.

## Constraints to never violate

- **`x-client` header is mandatory** on every Habitica API request (`<your-user-id>-<appname>`)
  or the request is rejected outright. Baked in via `VITE_HABITICA_CLIENT_ID`.
- **Rate limit: 30 requests/60s.** The API client must queue and back off on `429` using the
  `Retry-After` header — don't just let requests fail. TanStack Query's retry config should be
  tuned around this from the start, not bolted on later.
- **`GET /tasks/user` has no tag filter param.** All tag filtering is client-side. Don't design
  around a server-side filter that doesn't exist.
- Full footgun list (task `value` field rules, score-endpoint response shape, priority enum,
  etc.): `docs/habitica-api.md` § Footguns.

## Conventions

- Habitica API calls go through `src/lib/habitica/client.ts` only — nothing else constructs
  `fetch()` calls against `habitica.com`.
- Task/Tag/User TypeScript types in `src/lib/habitica/types.ts` should match
  `docs/habitica-api.md` § Data shapes exactly; if a real API response disagrees with that doc,
  the doc is wrong and should be corrected in the same change, not silently worked around in a
  type assertion.
- Tests: Vitest, unit-testing every piece of pure business logic exhaustively *before* any UI is
  built around it (tag filter, task-value color scale, quick-add parser, task search ranking, the
  rate limiter) — this has been the actual correctness safety net so far. **Not built:**
  `@testing-library/react`/`jest-dom` are installed but unused (no component-render tests exist
  yet), and Playwright + MSW e2e (the original plan's proposal) was never set up at all — neither
  is a dependency. Correct this doc or actually build it if that gap starts to matter; don't leave
  it silently aspirational.

## Phase roadmap (from the implementation plan)

1. ✅ Foundation — Docker/compose skeleton, Vite+React+TS scaffold, API client + rate limiter,
   auth screen, read-only task list (all 4 types), light/dark toggle
2. ✅ Core interactions — scoring, create/edit/delete, checklists, difficulty/streak display
3. ✅ **Tag filter engine** — tag CRUD UI + the include/exclude filter with an any/all mode + saved presets
4. ✅ Redesign polish — loading/empty states, **+ the full §6a backlog** (quick-add bar, scoring
   feedback, expandable detail view, compact density toggle). "Full theming pass" and a dedicated
   responsive-layout pass were folded into this work rather than done as a separate abstract
   effort — see the note below.
5. *(separately-scoped, optional)* Party/guilds/chat/challenges/market/equipment — full RPG/social
   parity. Don't start this without an explicit decision to — see the plan for why.
6. ✅⚠️ Docker hardening — healthcheck (verified working, and a real bug in it fixed — see "Phase
   6 — Docker, actually verified" above); multi-arch build, versioned tags,
   TLS-behind-reverse-proxy notes remain (a packaging/publishing decision, not a correctness gap)

**Only Phase 5 remains as phase-sized work, and it needs an explicit decision to start — it isn't
queued by default.** Phases 1–4, the post-Phase-4 fixes (multi-word quick-add tags, task search),
the visual/responsive design pass, the real-usage feedback round, the wide-layout pass, the
due-date round, and Phase 6's build/serve verification (see above, all of them) cover the "fully
usable, modern-feeling daily-driver" milestone the original plan recommended stopping at
(`docs/implementation-plan.md` §6) — and now Docker itself is confirmed to actually work, not just
inspected. What's left, concretely: logging in against a real Habitica account end-to-end inside
the container (the one Docker checklist item still unverified), and Phase 6's packaging decisions
(multi-arch build / versioned tags / where images get published) whenever that's wanted. The
responsive breakpoint fixes from the design pass, and the rail/sticky-sidebar layout from the
feedback round, were both reasoned through, not verified on a real narrow-viewport device/browser
(no browser-automation tool was available in either sandbox) — worth a real on-device check if
anything still looks off. A few items were flagged rather than fixed along the way rather than
silently skipped — see "Not done, worth knowing about" in the real-usage feedback round section
(a true multi-column To-Dos layout, the `node-emoji` bundle-size cost) and the Phase 6 section
above (login end-to-end, multi-arch/versioned-tags/registry).

**Phase 4 has a real backlog now, captured during Phase 2 testing — see
`docs/implementation-plan.md` §6a before assuming Phase 4 is just "polish":** a universal
keyboard quick-add bar (needs a syntax design decision, not just code — don't invent the symbols
without checking), reward/XP feedback on scoring (data already available in `ScoreTaskResult`,
just needs a toast/flash), a verify-then-maybe-fix item on task-color update timing after
scoring, an expandable read-focused task detail view (distinct from the edit form), and a
persisted compact/condensed density toggle. Default order is after Phase 3, not blocked on it.
