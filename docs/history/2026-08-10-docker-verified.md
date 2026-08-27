# Phase 6 — Docker, actually verified

**When:** 2026-08-10

> Archived verbatim from the pre-2026-08-27 `CLAUDE.md`. References to sections
> "above" or "below" mean earlier/later rounds in `docs/history/README.md`.

---

Phase 6 — Docker, actually verified (immediately after the due-date round, same session — a real
Docker daemon (OrbStack, macOS host) became available, so the "never actually run" gap flagged
since Phase 1 finally got closed instead of staying a permanent caveat):

- **`docker compose up --build` was run for real** and the multi-stage build completes cleanly
  (`node:22-alpine` → `nginx:1.27-alpine`, ~78MB final image). `/healthz` responds `ok`, `/` and a
  client-routed path both return `200` with `index.html` (confirming `nginx.conf`'s SPA fallback
  actually works, not just reads correctly), and hashed assets serve with the intended
  `Cache-Control: immutable` while `index.html` stays `no-cache`.
- **Found and fixed a real bug in the process**: the container's own `HEALTHCHECK` (`wget -qO-
  http://localhost/healthz`) failed on *every single probe* with "connection refused" —
  permanently reporting the container `unhealthy` in `docker ps`/`docker inspect`, despite the app
  working completely fine from outside on the mapped host port. Root cause, confirmed by
  `docker exec`-ing in: busybox `wget` resolves `localhost` to `::1` (IPv6) first (`getent hosts
  localhost` confirms it), but nginx's plain `listen 80;` in `nginx.conf` only binds the IPv4
  wildcard on this image/kernel — so the probe connects to a port nothing is listening on.
  `curl`ing `127.0.0.1` (bypassing the IPv6 resolution) worked immediately. Fixed by pointing the
  `HEALTHCHECK` at `127.0.0.1` explicitly (`Dockerfile`) rather than depending on `localhost`'s
  resolution order — the standard fix for this well-known class of container healthcheck bug.
  Rebuilt and re-verified: `docker ps` now reports `(healthy)` on the very first probe. This is
  exactly the kind of bug that can only be found by actually running the container, not by
  inspection — it had been sitting in the Dockerfile since Phase 1.
- **Not verified**: logging in against a real Habitica account end-to-end. Everything above was
  checked without live credentials in the loop (this session never had a real Habitica user ID/API
  token) — it exercises `src/lib/habitica/client.ts` against the real API, not anything
  Docker-specific, so it's a meaningfully separate check from what's covered here.
- **Still open, and deliberately not decided here**: multi-arch build, versioned tags, and a
  registry to actually publish images to. That's a packaging/release decision (Docker Hub? GHCR?
  self-hosted registry? a version scheme?) that wasn't asked for and shouldn't be assumed — flagged
  as the remaining Phase 6 scope rather than silently built.
- The verification container ran on `HOST_PORT=8081` (an env-var override on the `docker compose
  up` invocation, not a change to the repo's `.env` — port 8080 was already in use by an unrelated
  container on this machine) and was torn down (`docker compose down`) after confirming healthy,
  rather than left running. `.env` itself was left untouched — it already existed with the
  placeholder `VITE_HABITICA_CLIENT_ID` from `.env.example`, still needs the real value set before
  this is used for anything but a build/serve smoke test.

