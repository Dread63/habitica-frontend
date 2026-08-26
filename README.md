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
a packaging decision, not a correctness gap — see `CLAUDE.md`. Phase 5 (RPG/social-features
milestone) is optional, separately scoped work; see `CLAUDE.md`'s roadmap section before starting
it.

## Docs

- `CLAUDE.md` — project context, architecture decisions, conventions (start here)
- `docs/implementation-plan.md` — full design: architecture, tech stack, tag-filter engine, phases
- `docs/habitica-api.md` — curated Habitica API v3 reference for this project
- `docs/api-examples/` — real example API payloads + a script to capture your own

## Local development

```sh
npm install
npm run dev            # no configuration needed — see the note below
```

## Docker

```sh
docker compose up --build          # http://localhost:8080
HOST_PORT=9000 docker compose up --build   # ...or pick another port
```

Deploying to a NAS or another always-on box? See **[docs/deploy-synology.md](docs/deploy-synology.md)** —
prebuilt multi-arch images are published to `ghcr.io/dread63/habitica-frontend` on every push to
`master`, so the target host never needs a build toolchain.

**No build-time configuration.** The app used to require `VITE_HABITICA_CLIENT_ID` (Habitica's
mandatory `x-client` header) to be set before building, which made every build personal to one
account. That header is now derived from the user id you log in with, so a single published image
works for anyone and there is nothing to configure before `npm run dev` or `docker compose up`.

**Verified against a real Docker daemon** (OrbStack, macOS host) — first time this exact command
has actually been run, not just inspected:
- the multi-stage build completes (`node:22-alpine` build → `nginx:1.27-alpine` serve), image
  ends up ~78MB
- `curl http://localhost:8080/healthz` returns `ok`, and — the thing that turned out to actually
  matter — `docker ps` reports the container itself `(healthy)`, not just externally reachable
  (see the `HEALTHCHECK` fix note above)
- the app loads at `http://localhost:8080`, and a hard refresh at a client-routed path (e.g.
  `/tasks/anything`, not just `/`) returns `200` with `index.html`, not a `404` — confirming
  `nginx.conf`'s SPA fallback (`try_files $uri /index.html`) actually works, not just reads
  correctly
- hashed assets (`/assets/*.js`) serve with `Cache-Control: public, max-age=31536000, immutable`;
  `index.html` itself serves `no-cache`, as intended

**Still not verified: logging in against a real Habitica account end-to-end.** Everything above
was checked without live Habitica credentials in the loop — worth doing once, but it exercises
`src/lib/habitica/client.ts` against the real API, not anything Docker-specific.

If anything's wrong, `Dockerfile`/`docker-compose.yml`/`nginx.conf` are the three files to check
first — see `CLAUDE.md`'s Phase 6 note for what "hardening" still means beyond just working
(multi-arch build, versioned tags, TLS-behind-reverse-proxy notes — a packaging/publishing
decision, not something broken).
