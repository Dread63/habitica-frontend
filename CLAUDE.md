# Habitica Frontend

A self-hosted alternative frontend for Habitica: dark mode, a modernised layout, a real tag
filter engine (Habitica's own frontend only supports AND-only include), and an app-local
timeline + time-tracking layer that never touches Habitica's API.

React 19 + TypeScript + Vite SPA calling `habitica.com/api/v3` directly from the browser, plus a
tiny zero-dependency Node service (`api/`) for app-local data. Deployed via Docker to a Synology
NAS.

---

## Read this before you write code

**Match the task to a doc and read that one first.** Don't read them all — each is scoped so you
only need the one that covers what you're touching.

| If you're touching… | Read first |
|---|---|
| Running the app locally at all | `docs/development.md` — the api service means `npm run dev` alone is only half the stack |
| Anything calling the Habitica API | `docs/habitica-api.md` — endpoints, data shapes, **§ Footguns** |
| Due dates, scheduling, anything with a calendar date | `docs/gotchas.md` § Dates — **the most expensive bug in this repo lives here** |
| `features/tracking`, `features/timeline`, `features/pomodoro` | `docs/time-tracking.md` — the three-records model |
| A zustand store, sync, or anything persisted | `docs/gotchas.md` § Persisted stores |
| Docker, nginx, deployment, the `api/` service | `docs/gotchas.md` § Docker, then `docs/deploy-synology.md` |
| Charts, category colors, stats panels | `docs/gotchas.md` § Charts |
| Anything at all, if you have budget for one more file | `docs/gotchas.md` in full — every entry is a real bug already paid for |

Supporting docs, only when you need them:

- `docs/architecture.md` — decided calls and why; what's left to build
- `docs/conventions.md` — code/test/verification discipline, and where to write things down
- `docs/history/` — chronological archive. **Archaeology only.** Later rounds contradict earlier
  ones; if it disagrees with `gotchas.md`, gotchas.md wins
- `docs/implementation-plan.md` — original design rationale and phase breakdown
- `docs/api-examples/*.json` — real captured API responses
- `docs/vendor/` — Habitica's own Mongoose schemas and route source (ground truth)

---

## Non-negotiables

These are in this always-loaded file because getting one wrong breaks the app or corrupts data.

- **`x-client` header is mandatory on every Habitica request** — derived in `client.ts` as
  `${userId}-habitica-modern-frontend`, never configured.
- **The app has zero build-time configuration.** No `VITE_*` variables. Adding one forks the
  published image per deployment and breaks pull-to-update on the NAS.
- **Rate limit is 30 requests / 60s.** The client queues and backs off on `429` via
  `Retry-After`. Don't bypass it.
- **All Habitica calls go through `src/lib/habitica/client.ts`.** Nothing else builds a `fetch()`
  against habitica.com.
- **`GET /tasks/user` stops returning a to-do once it's completed.** Use `useTaskLookup()`.
- **Never send a bare `"YYYY-MM-DD"` to Habitica** — it parses as UTC midnight and lands a day
  early west of UTC. Use `toApiDateTime()` from `src/lib/dateOnly.ts`.
- **Bumping a zustand `persist` version without a `migrate` silently discards stored state.**
  Always ship a migration, even an identity one.
- **Time is recorded, never inferred.** The plan (timeline blocks) is never evidence of what was
  worked on. Never re-fuse the three time records.
- **Never fetch `apidoc.habitica.com`** — it's a client-rendered SPA that returns `"Loading..."`
  to every non-browser tool. Everything needed is vendored in `docs/`.

---

## Commands

```bash
npm run dev                  # vite dev server (:5173) — frontend only; /api/ 503s, sync off
npm run dev:api              # api service (:8081), db at ./.local-data/ — run alongside dev
npm run verify               # typecheck && lint && test && build — the gate
npm test                     # vitest run — covers frontend AND api in one pass
docker compose up --build    # full stack: web (nginx) + api (node:sqlite)
```

`npm run dev` on its own is a supported setup — localStorage is the working copy and sync only
mirrors it. Run `dev:api` too when touching sync, export, or persistence.
**Details and traps: `docs/development.md`.**

**Run `typecheck && lint && test && build` before claiming anything is done**, then state
explicitly what you did *not* verify. No browser automation has ever been available in this
project — anything about rendered behaviour is reasoned, not observed.

---

## Where the code is

```
src/lib/habitica/     client.ts (the ONLY fetch to habitica.com), rateLimiter, auth, types
src/lib/              dateOnly.ts (local calendar + toApiDateTime), timeOfDay.ts, emoji,
                      useTwemoji, sync/mergeState.ts (mergeVersioned — exists exactly once)
src/features/tasks/   Dashboard, TodoBoard, TaskCard, quickAdd, taskSearch, todoBuckets,
                      taskColor (aging scale), taskType (per-type identity), useTasks
src/features/tags/    tagFilter (the feature this project exists for), tagFilterStore
src/features/timeline/  TimelineScrubber, timelineEntries, timelineLanes, ScheduleFields
src/features/tracking/  timeEntries (the ledger), reconciliation, planVsActual
src/features/pomodoro/  pomodoroEngine (timestamp-anchor clock), pomodoroPhases (append-only)
src/features/auth|theme/  AuthProvider, ThemeProvider, DensityProvider
src/components/ui/    hand-authored shadcn-style primitives; dialog.tsx is a native <dialog>
api/src/              server.js, store.js (node:sqlite), export.js (CSV/JSON)
```

Pure logic sits next to its `.test.ts`. **Pure logic takes `now` as a parameter** rather than
reading the clock — that's what makes the date math testable.

---

## Status

Phases 0–4 are done, plus design/feedback/layout/due-date rounds, Docker (verified against a
real daemon), a multi-arch GHCR publishing pipeline, NAS sync + export, and a full time-tracking
rebuild. **Phase 5 (party / guilds / chat / market) is the only phase-sized work left and is not
queued — it needs an explicit decision to start.**

Known gaps, all deliberate: nobody has logged into a real Habitica account from inside the
container; no browser has ever click-tested the UI; no multi-device sync session has been run.
Details in `docs/architecture.md` § What's left.

---

## Keeping this file small

This file is loaded into context on **every** session in every harness (Claude Code reads
`CLAUDE.md`; Pi reads `AGENTS.md` or falls back to `CLAUDE.md` — deliberately only this one file
exists, so neither tool double-loads it).

It was 96KB and ~24k tokens until 2026-08-27, which on a local model meant a third of the
context window and minutes of prompt processing consumed before reading a single line of code.

**A new line goes here only if an agent must know it within the first ten seconds of every
session.** Everything else has a home: rules → `docs/gotchas.md`, decisions →
`docs/architecture.md`, stories → `docs/history/`. See `docs/conventions.md` § Writing things
down.
