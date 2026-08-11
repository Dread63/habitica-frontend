# Habitica Frontend — project context

A self-hosted, Docker-deployed alternative frontend for Habitica: dark mode, a modernized
layout, and a real tag filter engine (include-any / require-all / exclude — Habitica's own
frontend only supports AND-only include). Full design rationale: `docs/implementation-plan.md`.

## Status

**Phase 0 through 4 are done** — the full §6a backlog (quick-add bar, reward/XP feedback,
detail view, compact density) plus loading/empty-state polish — **and so is a round of
post-Phase-4 fixes, a visual/responsive design pass, and a real-usage feedback round** (13 notes
from actually using the app day-to-day: task ordering, completed-task visibility, due dates, a
layout reorg moving Habits/Dailies/Rewards into a collapsible rail, a "Proton Carbon" theme
reskin, in-place title/notes editing, a tag-filter interaction rework, emoji shortcode rendering,
hotkeys, and replacing every `window.confirm`/`window.prompt` with themed in-app dialogs). Search
"Post-Phase-4 fixes", "Visual/responsive design pass", and "Real-usage feedback round" below for
the details. Phase 5 (party/guilds/chat/market — optional, separately scoped) and Phase 6 (Docker
hardening) remain. See `docs/implementation-plan.md` §6 for the full phase breakdown.

**Picking this up on a machine that actually has Docker (the concrete next step, per the notes
below):**
1. `cp .env.example .env`, set `VITE_HABITICA_CLIENT_ID` to `<your-habitica-user-id>-habitica-modern-frontend`
2. `docker compose up --build` — this exact command has never been run against a real Docker
   daemon before now; the Dockerfile/compose/nginx.conf are correct by inspection only (see "What
   Phase 1 built" below and README.md's Docker section for the specific things to check: the
   multi-stage build completes, `/healthz` responds, login works end-to-end against a real
   Habitica account, and a hard refresh on a client-routed path doesn't 404)
3. If that all works, Phase 6 (healthcheck is already there; multi-arch build, versioned tags,
   TLS-behind-reverse-proxy notes remain) is the natural next unit of work — or just start using
   the app daily and let real usage surface what's actually missing before committing to Phase 5.

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
6. Docker hardening — healthcheck, multi-arch build, versioned tags, TLS-behind-reverse-proxy notes

**Nothing is queued next.** Phases 1–4, the post-Phase-4 fixes (multi-word quick-add tags, task
search), the visual/responsive design pass, and the real-usage feedback round (see above, all
three) cover the "fully usable, modern-feeling daily-driver" milestone the original plan
recommended stopping at (`docs/implementation-plan.md` §6). Remaining scope is Phase 5 (a second
application's worth of work — RPG/social features — needs an explicit decision to start, not a
default) and Phase 6 (Docker hardening: the Dockerfile/compose have never been build-tested
against a real Docker daemon in the sandbox this was built in — see the note in "What Phase 1
built" above — that's the one concrete gap worth closing even if Phase 5 stays out of scope). The
responsive breakpoint fixes from the design pass, and the new rail/sticky-sidebar layout from the
feedback round, were both reasoned through, not verified on a real narrow-viewport device/browser
(no browser-automation tool was available in either sandbox) — worth a real on-device check if
anything still looks off. Two items from the feedback round were flagged rather than fixed — see
"Not done, worth knowing about" at the end of that section (a true multi-column To-Dos layout, and
the `node-emoji` bundle-size cost).

**Phase 4 has a real backlog now, captured during Phase 2 testing — see
`docs/implementation-plan.md` §6a before assuming Phase 4 is just "polish":** a universal
keyboard quick-add bar (needs a syntax design decision, not just code — don't invent the symbols
without checking), reward/XP feedback on scoring (data already available in `ScoreTaskResult`,
just needs a toast/flash), a verify-then-maybe-fix item on task-color update timing after
scoring, an expandable read-focused task detail view (distinct from the edit form), and a
persisted compact/condensed density toggle. Default order is after Phase 3, not blocked on it.
