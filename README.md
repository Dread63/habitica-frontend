# habitica-frontend

A self-hosted alternative frontend for [Habitica](https://habitica.com) — dark mode, a
modernized layout, and a tag filter that actually supports OR/exclude, not just Habitica's
AND-only include.

Not affiliated with or endorsed by Habitica.

## Status

Pre-code. Phase 0 (API validation + documentation) is complete — see `CLAUDE.md` for the current
phase and `docs/implementation-plan.md` for the full roadmap.

## Docs

- `CLAUDE.md` — project context, architecture decisions, conventions (start here)
- `docs/implementation-plan.md` — full design: architecture, tech stack, tag-filter engine, phases
- `docs/habitica-api.md` — curated Habitica API v3 reference for this project
- `docs/api-examples/` — real example API payloads + a script to capture your own

## Setup (once there's code to run)

```sh
cp .env.example .env   # set HABITICA_CLIENT_ID to <your-habitica-user-id>-habitica-modern-frontend
docker compose up --build
```
