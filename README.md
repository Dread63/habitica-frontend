# habitica-frontend

A self-hosted alternative frontend for [Habitica](https://habitica.com) — dark mode, a
modernized layout, and a tag filter that actually supports OR/exclude, not just Habitica's
AND-only include.

Not affiliated with or endorsed by Habitica.

## Status

Phase 1 (foundation) in progress. See `CLAUDE.md` for current phase and `docs/implementation-plan.md`
for the full roadmap.

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
cp .env.example .env
docker compose up --build
```
