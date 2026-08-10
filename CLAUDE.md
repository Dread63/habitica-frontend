# Habitica Frontend — project context

A self-hosted, Docker-deployed alternative frontend for Habitica: dark mode, a modernized
layout, and a real tag filter engine (include-any / require-all / exclude — Habitica's own
frontend only supports AND-only include). Full design rationale: `docs/implementation-plan.md`.

## Status

**Phase 0 through 4 are done** — the full §6a backlog (quick-add bar, reward/XP feedback,
detail view, compact density) plus loading/empty-state polish. Phase 5 (party/guilds/chat/market
— optional, separately scoped) and Phase 6 (Docker hardening) remain. See
`docs/implementation-plan.md` §6 for the full phase breakdown.

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
- Tests: Vitest + Testing Library for units (especially the tag filter engine), Playwright + MSW
  for e2e (MSW mocks the Habitica API so tests never burn real rate limit or need live
  credentials).

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

**Nothing is queued next.** Phases 1–4 are the "fully usable daily-driver" milestone the original
plan recommended stopping at (`docs/implementation-plan.md` §6). Remaining scope is Phase 5 (a
second application's worth of work — RPG/social features — needs an explicit decision to start,
not a default) and Phase 6 (Docker hardening: the Dockerfile/compose have never been build-tested
against a real Docker daemon in the sandbox this was built in — see the note in "What Phase 1
built" above — that's the one concrete gap worth closing even if Phase 5 stays out of scope).
A dedicated visual-design pass (distinct task-type accents beyond color/icon, animation/transition
polish, tighter responsive breakpoints tested on a real narrow viewport) is also still open if the
"modern, intuitive" bar isn't fully met yet — ask the user rather than assuming which of these to
pick up.

**Phase 4 has a real backlog now, captured during Phase 2 testing — see
`docs/implementation-plan.md` §6a before assuming Phase 4 is just "polish":** a universal
keyboard quick-add bar (needs a syntax design decision, not just code — don't invent the symbols
without checking), reward/XP feedback on scoring (data already available in `ScoreTaskResult`,
just needs a toast/flash), a verify-then-maybe-fix item on task-color update timing after
scoring, an expandable read-focused task detail view (distinct from the edit form), and a
persisted compact/condensed density toggle. Default order is after Phase 3, not blocked on it.
