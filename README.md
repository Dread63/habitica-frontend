# habitica-frontend

A self-hosted alternative frontend for [Habitica](https://habitica.com) — dark mode, a
modernized layout, and a tag filter that actually supports OR/exclude, not just Habitica's
AND-only include.

Not affiliated with or endorsed by Habitica.

## Status

Phases 0–4 are done: auth, full task/tag CRUD and scoring, the tag filter engine (include-any /
require-all / exclude), and a redesign/polish pass (quick-add bar, reward/XP feedback, expandable
detail view, compact density, task search, per-type visual accents, animation polish, responsive
layout fixes) — plus further rounds of fixes from real day-to-day use: task ordering, due dates
(including a real timezone bug fix — see `CLAUDE.md`), completed-task visibility, a violet
"Proton Carbon" theme, Habits/Dailies/Rewards moved into a collapsible rail so To-Dos gets the
wide main area (optionally grouped into Today & overdue / This week / Later / Someday, with
drag-and-drop between them), a themed date picker, quick-add `@date` shorthand, hotkeys, and
in-app confirm/prompt dialogs. That's the "fully usable daily-driver" milestone — see `CLAUDE.md`
for the detailed build log and `docs/implementation-plan.md` for the full roadmap.

**Docker is now verified** (Phase 6) — see the Docker section below for exactly what was checked
and what wasn't yet (login against a real account). A real bug was found and fixed in the
process: the container's own `HEALTHCHECK` targeted `http://localhost/healthz`, which resolved to
`::1` before nginx's IPv4-only `listen 80` inside the container — every healthcheck probe failed
with "connection refused" even though the app worked fine externally. Fixed to target `127.0.0.1`
directly. Remaining Phase 6 scope (multi-arch build, versioned tags, a registry to publish to) is
a packaging decision, not a correctness gap — see `docs/architecture.md`. Phase 5 (RPG/social-features
milestone) is optional, separately scoped work; see `docs/architecture.md` § What's left before
starting it.

## Docs

- `CLAUDE.md` — the standing brief for coding agents: non-negotiables + a routing table
  pointing at the doc that covers whatever you're touching (start here)
- `docs/development.md` — running it locally: the dev server, the api service, the SQLite db
- `docs/gotchas.md` — **every trap, indexed by area.** Each entry is a bug already paid for
- `docs/architecture.md` — decided calls and why; what's left to build
- `docs/time-tracking.md` — the three-records model (plan / ledger / phase log)
- `docs/conventions.md` — code, test and verification discipline
- `docs/history/` — chronological archive of every build round (archaeology; read `gotchas.md`
  instead unless you need to know *why*)
- `docs/implementation-plan.md` — full design: architecture, tech stack, tag-filter engine, phases
- `docs/habitica-api.md` — curated Habitica API v3 reference for this project
- `docs/api-examples/` — real example API payloads + a script to capture your own
- `docs/install-docker.md` — **installing and running it with Docker** (folders, Portainer,
  Synology, backups, updating, troubleshooting)
- `docs/deploy-synology.md` — how the images get built and published (GitHub Actions → GHCR)

## Local development

```sh
npm install
npm run dev            # frontend only, :5173 — no configuration needed
```

That's enough for most work: localStorage is the working copy, so the app runs fully without
the sync service (it just reports sync unavailable).

When you're changing sync, export, or timeline/pomodoro persistence, run the api too — Node ≥ 24,
no install step, database at `./.local-data/`:

```sh
npm run dev:api        # terminal 1 — :8081
npm run dev            # terminal 2 — :5173, proxies /api → :8081
```

**Full guide, including how `/api/` resolves in dev vs production: [docs/development.md](docs/development.md).**

## Install with Docker

**Full instructions: [docs/install-docker.md](docs/install-docker.md)** — folder layout, Portainer
and Synology walkthroughs, backups, updating, troubleshooting.

The short version. Two containers and one folder:

```
habitica-frontend/            ← create this folder anywhere
├── docker-compose.yml        ← from deploy/docker-compose.yml
└── data/                     ← created for you; THIS is what to back up
    └── focus.sqlite          ← your timeline + focus history
```

```sh
mkdir -p ~/docker/habitica-frontend && cd ~/docker/habitica-frontend
curl -O https://raw.githubusercontent.com/Dread63/habitica-frontend/master/deploy/docker-compose.yml
docker compose up -d          # http://localhost:8080
```

| container | role | holds data |
|---|---|---|
| `web` | nginx serving the app, proxies `/api/` to `api` | no |
| `api` | sync + export service, owns one SQLite file | yes, in `data/` |

`web` runs fine on its own if you don't want sync — the app falls back to browser storage, which
is per-device. With `api`, your timeline and time log follow you between devices and can be
exported as CSV or JSON from the pomodoro dialog's **Data** tab.

**Time is recorded, not inferred.** One task is "active" at a time; starting, switching or
stopping writes a real interval as it happens. A minute, once elapsed, belongs to whoever owned
it then — rearranging your plan afterwards can't move it. The CSV export is one row per interval
with its own start and end, so summing by task or category in a spreadsheet gives exact totals.

Prebuilt multi-arch images (amd64 + arm64) are published to `ghcr.io/dread63/habitica-frontend`
and `…-api` on every push to `master`, so the host never needs a build toolchain. Deploying to a
NAS: **[docs/deploy-synology.md](docs/deploy-synology.md)**.

### Building locally instead

```sh
docker compose up --build             # http://localhost:8080
HOST_PORT=9000 docker compose up --build
```

**No build-time configuration.** The app used to require `VITE_HABITICA_CLIENT_ID` (Habitica's
mandatory `x-client` header) to be set before building, which made every build personal to one
account. That header is now derived from the user id you log in with, so a single published image
works for anyone and there is nothing to configure before `npm run dev` or `docker compose up`.

**Your Habitica API token never reaches your server.** The app calls habitica.com directly from
the browser; the `api` container only ever stores timeline placements and focus history. It also
has no authentication of its own, so keep it on a trusted network — see the Security section of
the install guide.
