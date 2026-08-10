# Habitica Frontend — project context

A self-hosted, Docker-deployed alternative frontend for Habitica: dark mode, a modernized
layout, and a real tag filter engine (include-any / require-all / exclude — Habitica's own
frontend only supports AND-only include). Full design rationale: `docs/implementation-plan.md`.

## Status

**Phase 0, 1, and 2 are done.** Start at Phase 3 (the tag filter engine — see the dedicated
section below). See `docs/implementation-plan.md` §6 for the full phase breakdown.

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

## The feature that matters most: tag filtering

Habitica's own frontend filters tasks by tag with AND-only, include-only logic. This project's
whole reason to exist (alongside the redesign) is replacing that with three independent buckets:

- `anyOf` — task matches if it has **any** of these tags (OR)
- `allOf` — task matches only if it has **all** of these tags (AND — Habitica's current behavior, kept as an option)
- `noneOf` — task is excluded if it has **any** of these tags

This is a **pure client-side filter** over the already-fetched task array — `GET /tasks/user`
has no tag query param and never will (confirmed in `docs/habitica-api.md`), so there is no API
interaction to design here, only correct, well-tested filtering logic. Full spec:
`docs/implementation-plan.md` §4. Write this module's unit tests exhaustively (empty buckets,
overlapping buckets, a tag present in both `anyOf` and `noneOf`) before building UI around it.

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

1. Foundation — Docker/compose skeleton, Vite+React+TS scaffold, API client + rate limiter, auth
   screen, read-only task list (all 4 types), light/dark toggle
2. Core interactions — scoring, create/edit/delete, checklists, difficulty/streak display
3. **Tag filter engine** — tag CRUD UI + the 3-bucket filter + saved presets
4. Redesign polish — full theming pass, responsive layout, loading/empty states
5. *(separately-scoped, optional)* Party/guilds/chat/challenges/market/equipment — full RPG/social
   parity. Don't start this without an explicit decision to — see the plan for why.
6. Docker hardening — healthcheck, multi-arch build, versioned tags, TLS-behind-reverse-proxy notes

Next up: **Phase 3** — tag CRUD UI + the `anyOf`/`allOf`/`noneOf` filter engine described above,
plus saved filter presets. The filter function itself should be a pure, exhaustively-tested
module *before* any UI is built around it — same pattern `taskColor.ts`/`taskColor.test.ts`
already established in this codebase.
