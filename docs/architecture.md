# Architecture — decided, don't re-litigate without reason

Each of these was a real fork with a real alternative. They're settled. Reopening one is
allowed, but do it deliberately and say so — don't drift into a different design by accident.

## No custom backend for Habitica data

The SPA calls `habitica.com/api/v3` directly from the browser. The user's credentials live in
browser storage and are never proxied or stored server-side.

This works because **CORS is open** on the Habitica API (`access-control-allow-origin: *`,
verified with a live `OPTIONS` request in Phase 0). It removes an entire tier from the system —
no token custody, no session layer, no server to keep patched.

**This part is not up for revisiting.**

## One small backend for app-local data

Added 2026-08-27, deliberately reopening the "no backend at all" decision — **narrowly**. The
driver was wanting focus/timeline data available from any device, plus an exportable record of
where time went.

`api/` is a zero-dependency Node 24 service using the built-in `node:sqlite`. It serves sync +
export for timeline placements, the time ledger and the pomodoro phase log. **It never sees a
Habitica token and never contacts Habitica.** nginx proxies `/api/` to it same-origin.

Why it doesn't compromise the decision above:

- **`node:sqlite`, not better-sqlite3** — SQLite is in Node core as of 24, so there are zero
  runtime dependencies and no native compilation on any architecture. `api/` has no build stage
  at all; `node src/server.js` runs the source directly.
- **The server is deliberately dumb about app shapes.** Every record stores an opaque JSON
  `payload` and merges on `(user_id, id)` plus a timestamp. App types can evolve without a
  server migration, and the server can't corrupt a shape it doesn't understand.
- **localStorage stays the working copy**; sync only mirrors it. The frontend container still
  runs standalone, and an unreachable NAS degrades to "saved locally, uploaded on reconnect".
- **Full-state push, not a delta.** For one person's data that's a small request and it makes
  the protocol self-healing — any successful sync reconciles everything, so a missed push or a
  month-old device recovers with no queue to replay. Revisit with a `since` param only if it
  gets big enough to notice.

Trust model, stated not hidden: the service takes `X-Habitica-User-Id` at face value. See
`docs/gotchas.md` § Docker for why that's acceptable and what would break it.

## Zero build-time configuration

The app has **no** `VITE_*` variables. `x-client` is derived at request time from the user id
already being sent as `x-api-user`.

This isn't a style preference — it's what makes one published image usable by anyone. A
build-time var forks the image per deployment and breaks the pull-to-update workflow on the
NAS. `src/vite-env.d.ts` is a deliberately empty `ImportMetaEnv` with a note saying so.

## Stack

| Choice | Why |
|---|---|
| React + TypeScript + Vite | Baseline; nothing exotic |
| TanStack Query | Retry/backoff maps directly onto Habitica's rate limit |
| Tailwind v4 + shadcn/ui conventions | Theming via CSS custom properties; components hand-authored following shadcn's cva + `cn()` pattern rather than scaffolded via its CLI, to avoid an interactive prompt in automated builds. `npx shadcn@latest add <x>` still works without conflict |
| Zustand | Small local UI state — filter buckets, timeline entries, pomodoro run state. Used where `persist` middleware earns its keep; theme and auth use plain Context because they don't need it |

## Tag filtering — the feature this project exists for

Habitica's own frontend filters by tag with AND-only, include-only logic. Replacing that is the
reason this app exists (alongside the redesign).

```
included: string[]           the selected tags
mode: 'any' | 'all'          ONE explicit switch: do included tags combine with OR or AND
excluded: string[]           tasks carrying any of these are hidden, regardless of mode
```

A pure client-side filter over the already-fetched task array. There was never an API
interaction to design — `GET /tasks/user` has no tag param — only correct filtering logic. 29
tests in `tagFilter.test.ts`.

**Two superseded designs, so you recognise them if you meet one in old context:**

1. *Three per-tag buckets* (`anyOf`/`allOf`/`noneOf`, green/blue/red chips). Killed by a real UX
   flaw: with one tag in a bucket, an OR-group and an AND-group are identical, so two
   differently-coloured chips appeared to do the same thing until a second tag was added.
   Replaced by the single explicit mode switch above.
2. *Three-state chip cycling* (neutral → included → excluded → neutral). Replaced by a plain
   2-state toggle on the chip body plus a separate `Ban`-icon button for the rarer, deliberate
   exclude action. **The data model above did not change** — this was the interaction layer only.

If you're reading a commit message or a stale mental model mentioning `anyOf`/`allOf`/`noneOf`
or `cycleTagInFilter`, it's describing a design that no longer exists. `tagFilter.ts` is the
source of truth.

## Layout

To-Dos is the only list long enough to earn the wide main area, so it's the only top-level
column (`TodoBoard.tsx`). Habits, Dailies and Rewards are collapsible sections in a left rail
(`TaskColumn.tsx` with `collapsible`), with the tag filter below them.

`TodoBoard` has two modes, driven by the `groupByDueDate` toggle:

- **Grouped (default):** four buckets — Today & overdue / This week / Later / Someday. "This
  week" is a *rolling next 7 days*, not the calendar week (a calendar week is nearly empty every
  Saturday, useless exactly when you'd be weekend-planning). Overdue and due-today share a
  bucket because they demand the same response. Undated to-dos get their own Someday column
  rather than being folded into Later, which would present them as scheduled. Sort within a
  bucket is due date ascending, then `value` ascending, so the longest-neglected card floats up.
  → `todoBuckets.ts`, 13 tests
- **Ungrouped:** one continuous list flowed across `xl:columns-3`. **CSS multi-column, not
  grid** — multicol flows top-to-bottom then to the next column, preserving reading order; a
  grid would place items 1/2/3 across the first row instead. Applies **no sort at all**, which
  is what keeps "new tasks go to the top" meaningful.

A true multi-column masonry grid for To-Dos was considered and deliberately not built: CSS Grid
gives variable-height cards equal row heights, leaving visible gaps, and real masonry needs a JS
layout library.

## Two independent color systems, never adjacent

- **`taskColor.ts`** — Habitica's task-aging scale (`value` → worst…purple), ported from
  vendored source with exact hex values, not approximated. Shown only as the card's left-border
  accent.
- **`taskType.ts`** — per-type identity (habit/daily/todo/reward). Appears only in column
  headers, the quick-add preview, and dialog titles — **never on the card body**, so the two
  can't be misread as conflicting signals about the same task.

Under the "Proton Carbon" theme (violet `--primary`), reward moved from purple to gold/amber:
with `--primary` also violet, two purple signals would have sat adjacent in the rail with no way
to tell them apart. The `taskColor.ts` purple for rewards is untouched — that's vendor data.

## What's left

**Phase 5 — party / guilds / chat / challenges / market / equipment** is the only phase-sized
work remaining, and it is **not queued by default**. It needs an explicit decision to start.
See `docs/implementation-plan.md` §6.

Everything else is done: phases 0–4, the design and feedback rounds, Docker (verified against a
real daemon), the publishing pipeline (multi-arch on GHCR), NAS sync + export, and the
time-tracking rebuild.

**Known open items**, flagged rather than silently skipped:

- **Logging in against a real Habitica account from inside the container has never been done.**
  It exercises `client.ts` against the live API, and the `x-client` derivation changed what goes
  on the wire. Step 5 of `docs/deploy-synology.md`.
- No browser automation has ever been available in any session that built this. The responsive
  breakpoints, the rail layout, the timeline scrubber, the stats panels and the reconciliation
  dialog were all reasoned through, not clicked through.
- A real multi-device sync session (phone + laptop at once) hasn't happened; the mechanics are
  covered by tests and a two-"device" curl exercise.
- `node-emoji` adds ~65KB gzipped to the main chunk, and the build warns about a >500KB chunk.
  Left as-is deliberately rather than half-solved.
- Monthly/yearly daily scheduling (`daysOfMonth`/`weeksOfMonth`) isn't in the editor form.
  Flagged in the UI, not silently dropped.
