# habitica-frontend

A self-hosted alternative frontend for [Habitica](https://habitica.com) — dark mode, a
modernized layout, and a tag filter that actually supports OR/exclude, not just Habitica's
AND-only include.

Not affiliated with or endorsed by Habitica.

## Status

Phases 0–4 are done: auth, full task/tag CRUD and scoring, the tag filter engine (include-any /
require-all / exclude), and a redesign/polish pass (quick-add bar, reward/XP feedback, expandable
detail view, compact density, task search, per-type visual accents, animation polish, responsive
layout fixes). That's the "fully usable daily-driver" milestone — see `CLAUDE.md` for the detailed
build log and `docs/implementation-plan.md` for the full roadmap.

**Not yet done, and the most concrete next step:** the Docker build has never actually been run
against a real Docker daemon — this repo was built in a sandbox without Docker available, so the
Dockerfile/compose file are correct by inspection only. `docker compose up --build` (see below) is
untested. Everything else — a Phase 5 RPG/social-features milestone — is optional, separately
scoped work; see `CLAUDE.md`'s roadmap section before starting it.

## Docs

- `CLAUDE.md` — project context, architecture decisions, conventions (start here)
- `docs/implementation-plan.md` — full design: architecture, tech stack, tag-filter engine, phases
- `docs/habitica-api.md` — curated Habitica API v3 reference for this project
- `docs/api-examples/` — real example API payloads + a script to capture your own

## Local development

```sh
npm install
cp .env.example .env   # set VITE_HABITICA_CLIENT_ID to <your-habitica-user-id>-habitica-modern-frontend
npm run dev
```

## Docker

```sh
cp .env.example .env   # set VITE_HABITICA_CLIENT_ID here too
docker compose up --build
```

This is the untested step mentioned above — first real run, worth checking:
- the build actually completes (multi-stage: `node:22-alpine` build → `nginx:1.27-alpine` serve)
- `curl http://localhost:8080/healthz` returns `ok` (the container's `HEALTHCHECK` target)
- the app loads at `http://localhost:8080`, login works end-to-end against a real Habitica
  account, and a hard refresh at `/login` (not just `/`) doesn't 404 — that's what `nginx.conf`'s
  SPA fallback (`try_files $uri /index.html`) exists to prevent
- if anything's wrong, `Dockerfile`/`docker-compose.yml`/`nginx.conf` are the three files to check
  first — see `CLAUDE.md`'s Phase 6 note for what "hardening" still means beyond just working
  (multi-arch build, versioned tags, TLS-behind-reverse-proxy notes)
