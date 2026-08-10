<!-- title: Habitica Frontend — Implementation Plan -->

# Habitica Frontend — Implementation Plan

A self-hosted, Docker-deployed alternative frontend for Habitica: dark mode, a modernized layout, and a real tag filter engine (include-any / require-all / exclude — not just Habitica's AND-only include).

---

## 1. Architecture decision

**No custom backend. A static SPA calling the Habitica API directly from the browser.**

Habitica's API is a public REST API meant for third-party clients — you authenticate with the user's own `x-api-user` / `x-api-key`, and third-party web tools (browser extensions, tools.habitica.com-style dashboards) already call it client-side. That means:

- The Docker image is just a built static bundle served by `nginx:alpine` — one service, no database, no server-side session.
- The user's API token lives in the browser (`localStorage`/IndexedDB), never touches a server you run. Lower liability, simpler compose file.
- **Day-1 validation item:** confirm CORS is actually open on the specific endpoints this app calls (`/api/v3/tasks/user`, `/api/v3/tags`, `/api/v3/user`) from a plain `fetch()` in the browser. This is expected to work, but it's a 10-minute check in Phase 0, and if any route is restricted, the fallback is a ~40-line passthrough proxy service added to compose — not a redesign.

```
┌─────────────────────────────┐
│  docker-compose              │
│  ┌─────────────────────────┐ │        ┌──────────────────┐
│  │ nginx:alpine             │─┼───────▶│ habitica.com/api  │
│  │  serving built SPA       │ │  browser  /v3 (direct)     │
│  └─────────────────────────┘ │  fetch  └──────────────────┘
└─────────────────────────────┘
```

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React + TypeScript + Vite | Fast dev/build, huge ecosystem, Claude generates idiomatic code for it reliably |
| Data fetching/caching | TanStack Query | Built-in caching, retry/backoff, request dedup — directly useful against Habitica's 30 req/60s limit |
| Styling / theming | Tailwind CSS (class-based dark mode) + CSS variables for tokens | Fast to theme, trivial light/dark toggle, works well with a component library |
| Components | shadcn/ui (Radix primitives) | Accessible, themeable, unstyled-by-default primitives — avoids fighting a pre-opinionated design system while redesigning the look |
| State (filters, UI) | Zustand (or React Context if you want zero deps) | Filter state is small and local; doesn't need Redux-scale machinery |
| Routing | React Router | Standard, minimal |
| Testing | Vitest + Testing Library (unit), Playwright + MSW (e2e against a mocked API) | MSW means tests never burn real rate limit or need a live account |

---

## 3. API client layer (`src/lib/habitica/`)

- `client.ts` — thin fetch wrapper. Injects `x-api-user`, `x-api-key`, `x-client` on every request; central **token-bucket rate limiter** (30 requests/60s); on `429`, reads `Retry-After` and requeues instead of failing.
- `types.ts` — hand-written TypeScript interfaces for `Task`, `Tag`, `User`, `Checklist`, etc., generated once from real API responses (see §7).
- `auth.ts` — a login screen that collects **User ID** and **API Token** (both live on the user's Habitica Settings → API page) and stores them locally. No password ever touches this app.
- `x-client` header — Habitica requires this as `<your-habitica-user-id>-<appname>`, e.g. `4c07969... -habitica-modern-frontend`. This is **per-developer, not auto-generated** — you'll need to put your own Habitica User ID in there once, in an env var (`VITE_HABITICA_CLIENT_ID`), so it ships baked into the image.

---

## 4. The tag filter engine — the actual feature you asked for

> **Revised after Phase 3 testing.** The original proposal below this line used three
> independent per-tag buckets (anyOf/allOf/noneOf, colored green/blue/red). Real use surfaced a
> UX flaw: with only one tag in a bucket, an OR-group and an AND-group are mathematically
> identical, so a green chip and a blue chip *looked* like they did the same thing until a
> second tag was added to one of them — confusing, since nothing in the UI hinted that the
> distinction only shows up at 2+ tags. Replaced with the model below, kept simpler on purpose:
> one included-tags list, one explicit any/all mode that applies to all of them, plus a separate
> exclude list. Trade-off, accepted deliberately: you can no longer mix "these are required" with
> "any of these work" in a single filter (e.g. the old model could express "Urgent AND (Home OR
> Chores)" — the new one can't). Implementation: `src/features/tags/tagFilter.ts`.

Habitica's own frontend only supports "tag is in this set, AND all of them." Replace that with:

| Field | Semantics |
|---|---|
| `included: string[]` | The tags currently selected for filtering |
| `mode: 'any' \| 'all'` | Whether `included` combines with OR or AND — one setting for the whole list, not per-tag |
| `excluded: string[]` | Tasks carrying any of these are hidden, regardless of `mode` |

A task passes the filter iff:

```ts
!excluded.some(t => task.tags.includes(t))
  && (included.length === 0
    || (mode === 'all' ? included.every(t => task.tags.includes(t)) : included.some(t => task.tags.includes(t))))
```

Implementation notes:
- Pure function, no memoization trickery needed beyond what `useMemo` already gives the caller —
  **no API calls per filter change.** Habitica hands you the full task array up front; filtering
  is instant, client-only. This also means the whole feature is unaffected by the rate limit.
- UI: each tag chip cycles neutral → included (highlighted) → excluded (red) → neutral on click;
  a separate, explicit "Match any / Match all" toggle controls how `included` combines — kept
  out of the per-tag color specifically so the any/all choice is never ambiguous the way it was
  in the original per-tag-bucket design.
- Persist named filter presets to `localStorage` (e.g. "Morning routine" = `{included: [home,
  morning], mode: 'any', excluded: []}`) so this isn't rebuilt every session.
- Write this module's logic with **exhaustive unit tests** first (empty filter, mode: any, mode:
  all, excluded alone, included+excluded together, and explicitly the 1-tag degenerate case where
  any/all collapse to the same result — that case is what motivated the redesign, so it's worth a
  named regression test, not just implicit coverage) — it's the one piece of business logic in the
  whole app worth being paranoid about, and it's fully pure/testable in isolation.

---

## 5. Theming & layout redesign

- Design tokens as CSS custom properties, light + dark palettes, `prefers-color-scheme` fallback plus a manual toggle persisted to `localStorage` (three-state: light / dark / system, same pattern any well-behaved themed app should use).
- Replace Habitica's dense single-column stacked rows with a clearer layout: left sidebar for tag filters + navigation, main area as columns for Habits / Dailies / To-Dos (or a tabbed view on mobile), light card treatment per task with difficulty/streak as small badges instead of inline clutter.
- Loading skeletons + empty states — Habitica's own UI has neither, and it shows.

---

## 6. Phased roadmap

| Phase | Scope | Notes |
|---|---|---|
| **0 — Spike** (~half day) | Confirm CORS from browser; hit `/user`, `/tasks/user`, `/tags` with curl using a real test account; capture real response JSON | De-risks the "no backend" decision before any app code exists |
| **1 — Foundation** | Docker/compose skeleton, Vite+React+TS scaffold, API client + rate limiter, auth screen, read-only task list rendering all 4 types, light/dark toggle | First runnable thing |
| **2 — Core interactions** | Scoring (habit +/−, daily checkbox, todo complete, reward buy), create/edit/delete task, checklists, difficulty/streak display | Matches baseline Habitica task functionality |
| **3 — Tag filter engine** | Tag CRUD UI + the include/exclude filter with an any/all mode (§4) + saved presets | This is the headline feature you asked for |
| **4 — Redesign polish** | Full theming pass, responsive layout, transitions, empty/loading states, **+ the interaction-polish backlog below** (§6a) | "Modern and intuitive" lands here |
| **5 — Stretch: RPG/social parity** *(optional, separate milestone)* | Avatar/equipment, party, guilds, chat, challenges, inbox, quests, market | This alone is bigger than Phases 1–4 combined — see note below |
| **6 — Docker hardening** | Healthcheck, multi-arch build, versioned tags, README, optional Caddy/Traefik labels for TLS behind a reverse proxy | Ship-readiness |

**Recommendation:** Phases 1–4 fully solve the two problems you actually described (dark mode/modern UI, real tag logic) and produce a genuinely usable daily-driver replacement for the task-management side of Habitica. Treat Phase 5 (party, guilds, chat, market, pets/mounts/equipment) as a later, separately-scoped decision — it's a full second application's worth of work, and it's worth using the app for a while first to see if you even miss those features in a personal tool.

## 6a. Phase 4 backlog — requested during Phase 2 testing

Captured here in full so none of this needs to be re-derived or re-asked-about when Phase 4
actually starts. Default order: after Phase 3 (tag filtering), since that's still the headline
feature — but nothing below is blocked on it, so pull items forward if it turns out to matter sooner.

### 1. Universal quick-add bar

One persistent input above all four columns — not Habitica's per-category floating dialogs —
where typing text and pressing Enter creates a task, with inline shorthand for tags/type/
difficulty instead of opening the full editor.

**Needs a design decision before implementation, not just code:** Habitica has no equivalent
feature to copy the syntax from — this is new UI vocabulary this app is inventing, so get
sign-off on the exact symbols before building the parser (a syntax that's wrong is worse than one
that's late, since users memorize it). Starting proposal, not a commitment:

- `#tagname` → tag (repeatable, well-worn convention — Todoist/GitHub/Superhuman all use it, low
  risk of surprising anyone)
- A leading sigil for type, since default type has to be *something* — `todo` is the sane default
  (most "quick capture" tools default to a plain task), with explicit markers to override:
  proposal `!habit`, `!daily`, `!reward` (bang-word rather than a single character, since
  single-char sigils risk colliding with characters people actually type in task titles)
- Difficulty: `!!` for hard, `!` for medium, unmarked for easy, maybe `~` for trivial — needs
  testing for how it reads next to the type sigil above (two different meanings for `!`-prefixed
  tokens in the same input is exactly the kind of ambiguity to resolve before writing the parser,
  not after)

Implementation shape once syntax is settled: a small tokenizer (not a regex-only approach —
tag/type/difficulty tokens can appear anywhere in the string and the remainder is the title) +
`useCreateTask` (already built, Phase 2). Lives above `Dashboard`'s column grid, not per-column.

### 2. Reward feedback on scoring (coins/XP)

Scoring currently gives no feedback beyond the checkbox/border flipping — no indication of what
was gained. The data is already there and unused: `useScoreTask`'s mutation response
(`ScoreTaskResult`, `src/lib/habitica/types.ts`) carries `delta`, full updated `hp`/`mp`/`exp`/`gp`/`lvl`,
and `_tmp` (item drops, quest progress). Needs a presentation layer only — a toast or a small
flash near the scored card (e.g. "+3 XP +1 GP", fading out) reading straight from the `onSuccess`
data already available in `taskMutations.ts`. Bonus, not required for v1 of this: detect a `lvl`
increase for a level-up moment, surface `_tmp.drop` for item drops.

### 3. Verify: does the task's color update correctly on completion?

Untested by the user as of this writing, but worth confirming the reasoning rather than just
asserting it works: `getTaskColorSwatch()` (`src/features/tasks/taskColor.ts`) is a pure function
of `task.value`, recomputed on every render — it is not cached or memoized separately from the
task object. `useScoreTask` always invalidates `['tasks']` on settle (Phase 2's deliberate
"reconcile via refetch" choice), so once that refetch lands, the card re-renders with the
server's new `value` and the border color updates automatically — no separate wiring needed, it
falls out of the existing architecture. **The one real gap:** the checkbox/completed state flips
*instantly* (optimistic), but the color update waits for the network round-trip, since Phase 2
deliberately didn't optimistically estimate `value`/`delta` client-side (see CLAUDE.md). That gap
between "looks done" and "looks re-colored" is milliseconds on a healthy connection but is a real,
noticeable-if-you're-watching-for-it inconsistency. Two options if it bothers in practice: (a)
leave it — resolves itself in well under a second; (b) add a rough optimistic `value` nudge
(direction of travel, not exact math) purely for the color transition, accepting it may be
slightly wrong until the refetch corrects it. Decide after actually seeing it, not preemptively.

### 4. Expand a task to a detail view

Clicking a task card's body (not the edit-pencil or delete-trash icons, which stay as-is) should
open a larger view built for *reading* — full markdown notes without the card's cramped width,
the complete checklist, not truncated. This is distinct from `TaskEditorDialog` (Phase 2), which
is a *form* for changing fields. Open design question for whenever this gets built: a separate
read-focused `TaskDetailDialog`, or extend `TaskEditorDialog` with a view/edit sub-mode toggle
(Notion/Linear-style — open to a read layout, one click into editing)? Leaning toward separate,
since a form and a rendered-prose reading layout want fairly different structure, but worth
deciding against whatever the app feels like once compact mode (#5) and the quick-add bar (#1)
have also landed and the card/dialog vocabulary is more settled.

### 5. Compact/condensed view toggle

A persisted UI density preference — same architectural pattern as `ThemeProvider` (three-state,
localStorage-backed, applied via a root class) — toggling `TaskCard` between the current spacing
and a denser variant (tighter padding, single-line notes preview instead of full markdown render,
possibly hiding the tag-chip row until hover). Straightforward once scoped: either extend
`ThemeProvider` into a general UI-preferences provider covering both theme and density, or add a
sibling `DensityProvider` next to it and a toggle button beside `ThemeToggle` in `Dashboard`'s
header. No open design questions here — this one's just unbuilt, not undecided.

---

## 7. Docker skeleton

**`Dockerfile`**
```dockerfile
# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_HABITICA_CLIENT_ID
ENV VITE_HABITICA_CLIENT_ID=$VITE_HABITICA_CLIENT_ID
RUN npm run build

# --- serve stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK CMD wget -qO- http://localhost/ || exit 1
EXPOSE 80
```

**`docker-compose.yml`**
```yaml
services:
  habitica-frontend:
    build:
      context: .
      args:
        VITE_HABITICA_CLIENT_ID: ${HABITICA_CLIENT_ID}
    ports:
      - "8080:80"
    restart: unless-stopped
```

`nginx.conf` just needs SPA fallback (`try_files $uri /index.html;`) since this is client-side routed.

---

## 8. Suggested repo structure

```
habitica-frontend/
├── docker-compose.yml
├── Dockerfile
├── nginx.conf
├── docs/
│   ├── habitica-api.md          ← curated API reference (see §9)
│   ├── api-examples/            ← real, sanitized JSON responses
│   └── openapi.yaml             ← community OpenAPI spec, if pulled in
├── src/
│   ├── lib/habitica/
│   │   ├── client.ts            ← fetch wrapper + rate limiter
│   │   ├── types.ts
│   │   └── auth.ts
│   ├── features/
│   │   ├── tasks/                (list, create/edit, scoring)
│   │   ├── tags/                 (CRUD + the filter engine)
│   │   └── theme/
│   ├── components/               (shadcn/ui-based)
│   └── App.tsx
├── CLAUDE.md
└── package.json
```

---

## 9. How to give Claude good documentation for the Habitica API

The rendered docs at `apidoc.habitica.com` are a client-rendered SPA — `WebFetch` and most scrapers only ever see `"Loading..."`. I confirmed this directly. Don't point Claude there. Instead:

1. **Route source is the real source of truth.** Habitica's docs are generated from `@api` jsdoc comments in the monorepo's route files (`github.com/HabitRPG/habitica`, under `website/server/controllers/api-v3/`). Reading the file *is* reading the docs, unrendered. The ones this project needs:
   - `tasks.js` — task CRUD, scoring, checklists, tag-on-task add/remove
   - `tags.js` — tag CRUD
   - `user.js` — profile, stats, preferences (`dayStart`, timezone, etc.)

   `WebFetch` works fine on the raw GitHub URLs (I used it above), so Claude can pull these directly when it needs ground truth.

2. **Pull in a real OpenAPI spec.** `github.com/igromanru/habitica-api` maintains an OpenAPI/Swagger spec generated from Habitica's docs. This is the single most Claude-friendly artifact available — structured, machine-parseable, good for generating typed clients or validating request/response shapes — much more reliable than re-deriving shapes from prose. Vendor a copy into `docs/openapi.yaml`.

3. **Curate a condensed, project-local reference — this is the one that matters most day to day.** Don't hand Claude the full spec (or the full route files) on every task; most of it is guild/chat/market routes this project doesn't use. Write `docs/habitica-api.md` containing *only*:
   - The auth header requirements (`x-api-user`, `x-api-key`, `x-client` — and that `x-client` is mandatory or requests are rejected)
   - The rate limit (30/60s, `429` + `Retry-After` behavior)
   - The ~15–20 endpoints this app actually calls, one line each
   - The `Task`, `Tag`, and relevant `User` field shapes, as real examples (next point)

   Reference this file from `CLAUDE.md` so it's always in scope: *"API reference: `docs/habitica-api.md`. Full spec: `docs/openapi.yaml`. Never fetch `apidoc.habitica.com` directly — it doesn't render for tools."*

4. **Capture real example payloads in Phase 0, before writing app code.** Hit `/user`, `/tasks/user`, and `/tags` with curl against a real (test) account, save the sanitized JSON into `docs/api-examples/`. Nothing prevents hallucinated field names better than "here is an actual task object, exactly as Habitica returns it" — nested shapes like `checklist`, `repeat`, and `history` are genuinely non-obvious from prose docs alone, and this is a five-minute step that pays for itself the first time Claude writes a type definition.

5. **Call out the two footguns explicitly, in writing, in the docs file** — the missing `x-client` header and no-backoff-on-429 are the two ways generated code silently breaks against this API. Don't rely on Claude inferring them from a schema; state them as constraints.

---

## Suggested next step

I can either (a) scaffold the Phase 0 spike + Phase 1 foundation right now (repo skeleton, Docker/compose, API client with rate limiting, auth screen, basic task list), or (b) start by writing `docs/habitica-api.md` and capturing the real API examples first, so the build phase has ground-truth docs to work against from the start. I'd lean toward (b) given how much this API punishes guessed field shapes — want me to start there?
