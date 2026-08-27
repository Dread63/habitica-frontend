# Focus data on the NAS — sync + export

**When:** 2026-08-27

> Archived verbatim from the pre-2026-08-27 `CLAUDE.md`. References to sections
> "above" or "below" mean earlier/later rounds in `docs/history/README.md`.

---

> [!WARNING]
> **Partly superseded.** The `focus_sessions` table is retired (not dropped), `mergeSessions` is gone in favour of `mergeVersioned<T>`, and the CSV was rewritten to one row per recorded interval rather than one row per task per session.
> Read `docs/time-tracking.md` for the model that is actually in the code.
> This file is kept because the *reasoning* is still useful, not as a description
> of current behaviour.

Focus data on the NAS — sync + export (2026-08-27). Direct request: focus/timeline data should
live on the NAS so it doesn't matter which device it's opened from, plus an export "showing how
I've spent my time... if anyone ever asked what my time management looked like". That required
reopening the documented **"No custom backend"** decision; it was reopened on purpose, and
narrowly — Habitica data still goes browser→habitica.com with no server in between. Four forks
settled via `AskUserQuestion`: SQLite (over append-only files), user-id scoping with LAN trust
(over server-side token verification), local cache + sync (over server-required), CSV + JSON.

- **`node:sqlite`, not better-sqlite3.** I'd flagged native modules as the risk with SQLite on a
  multi-arch build; Node 24 ships SQLite in core, so the service has **zero runtime dependencies**
  and no compilation on any architecture. `api/` therefore has no build stage at all —
  `node src/server.js` runs the source directly.
- **The server is deliberately dumb about app shapes.** Every record stores an opaque JSON
  `payload` and merges on `(user_id, id)` plus a timestamp, so `TimelineEntry` /
  `PomodoroSessionRecord` can evolve without a server migration and the server can't corrupt a
  shape it doesn't understand.
- **Three different merge rules, because the data differs**: timeline placements are mutable →
  last-write-wins on `updatedAt`; focus sessions are immutable history → union by id, with **no
  UPDATE path in SQL at all** (that's what makes the log worth something as evidence); settings
  are one record → last-write-wins. The *same* rules run client-side (`lib/sync/mergeState.ts`)
  and server-side (`WHERE updated_at <= excluded.updated_at`), which is what makes a sync safe to
  retry, run twice, or interrupt.
- **Deletes are tombstones** (`timelineEntryStore.tombstones`, kept *beside* `entries` rather than
  as a flag on them, so no read path can accidentally render a deleted placement). Without them a
  device that was offline during a delete resurrects the block on reconnect. A timestamp tie
  resolves to *deleted* — recoverable if wrong, unlike a silent divergence.
- **localStorage stays the working copy**; sync only mirrors. So the frontend container still runs
  standalone, and an unreachable NAS degrades to "saved locally, uploaded on reconnect". The
  pomodoro `run` state is deliberately **not** synced — a live countdown belongs to the machine
  that started it.
- **Full-state push, not a delta.** For one person's data that's a small request and makes the
  protocol self-healing: any successful sync reconciles everything, so a missed push or a
  month-old device recovers with no queue to replay. Revisit with a `since` param if it ever gets
  big enough to notice.
- **CSV is one row per task per session**, not per session — a 25-minute block split across two
  tasks becomes rows of 10 and 15, so a pivot on `minutes` gives real totals instead of
  double-counting the block. Tag ids resolved to names, local times beside UTC instants. Tag names
  and the timezone ride along in the synced settings payload because the server has no other way
  to learn them.
- **Trust model, stated not hidden**: the service takes `X-Habitica-User-Id` at face value. It's
  `expose:`d, not `ports:`ed, so only the web container can reach it. Do not port-forward it;
  VPN or real auth first.
- **A real bug only a live run could find**: with `USER node` in the api Dockerfile and a
  bind-mounted `./data`, the container crash-looped on `unable to open database file` — Docker
  auto-creates a missing bind-mount path as root, and a build-time `chown` is invisible because
  the mount is layered over the image at *run* time. Fixed with an entrypoint that chowns then
  drops privileges via `su-exec`. Same class of bug as the `localhost`/`::1` healthcheck one.
- **Verified against a live Docker daemon**, not inspected: both containers healthy, `/api/`
  answering through the nginx proxy, a push from one device visible to a second that had nothing,
  CSV splitting minutes correctly, data surviving `restart`, and — with the api container stopped
  — the frontend still serving 200 while `/api/` 502s into the offline path. 356 tests.
- **Not verified**: a real multi-device session against a real Habitica account. The sync
  mechanics are covered by tests and a two-"device" curl exercise, but nobody has yet opened the
  app on a phone and a laptop at once.

