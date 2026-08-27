# Phase 6 finished — publishing pipeline + Synology deployment

**When:** 2026-08-26

> Archived verbatim from the pre-2026-08-27 `CLAUDE.md`. References to sections
> "above" or "below" mean earlier/later rounds in `docs/history/README.md`.

---

Phase 6 finished — publishing pipeline + Synology deployment (2026-08-26). The remaining Phase 6
scope (multi-arch, versioned tags, a registry) is built, and the deployment target is a Synology
NAS. Three forks settled via `AskUserQuestion` first: CI-built images on GHCR (over building on
the NAS, which would run `npm ci` + `vite build` on NAS hardware), deriving the `x-client` header
instead of baking it in, and LAN-only HTTP to start.

- **The app now has *zero* build-time configuration**, and that's the change everything else here
  depends on. `VITE_HABITICA_CLIENT_ID` is gone: `client.ts` derives `x-client` as
  `${credentials.userId}-habitica-modern-frontend` from the user id it *already* sends as
  `x-api-user` on the same request — available from the login form onward, including on the
  pre-storage `verifyCredentials` call. Identical header value, no config. Without this a
  published image is personal to whoever built it, which rules out one image + pull-to-update.
  `src/vite-env.d.ts` is now a deliberately empty `ImportMetaEnv` with a note explaining why
  adding a `VITE_*` var back is a bigger decision than it looks.
- **`.github/workflows/publish-image.yml`** — a `verify` job (typecheck + lint + tests) gates a
  `publish` job that builds `linux/amd64,linux/arm64` and pushes to
  `ghcr.io/dread63/habitica-frontend`. Tags: `latest` on master, the git tag on `v*`, and
  `sha-<short>` every time, so there is always a specific build to roll back to. A failing verify
  publishes nothing.
- **Dockerfile build stage pinned to `--platform=$BUILDPLATFORM`.** Its only output is static
  files, which are architecture-independent, so emulating `npm ci` + `vite build` for arm64 would
  be minutes of pure waste. Confirmed by a real two-platform buildx run: the Node build executes
  **once**, natively, and only the nginx `COPY` layers are built per architecture.
- **`deploy/synology/docker-compose.yml`** — image-based, no build context, no `environment:`
  block, ready to paste into Container Manager → Project. The root `docker-compose.yml` stays
  build-based for local work; the two are labelled so it's obvious which is which.
- **`docs/deploy-synology.md`** — the full walkthrough: workflow push, GHCR package visibility
  (private by default, and a private package means registry creds on the NAS), Container Manager
  project, the update loop, rollback via `sha-`/`v*` tags, optional Watchtower scoped to this one
  container, troubleshooting, and reverse-proxy/HTTPS as a later add-on.
- **Verified for real this time, on a live Docker 29.7.2 daemon** (this session had one, unlike
  the sandbox that wrote most of Phase 6): build succeeds (74.8 MB image), `/healthz` returns
  `ok`, container reports **healthy** on the first probe, `/timeline` returns `200 text/html`
  (SPA fallback), `index.html` is `no-cache` while hashed assets are `immutable`, and the
  two-platform buildx build succeeds. Containers and the temporary buildx builder were torn down
  afterwards.
- **Still not verified**: logging in against a real Habitica account from inside the container.
  It exercises `client.ts` against the live API rather than anything Docker-specific — and it's
  now *more* worth doing than before, since the `x-client` derivation changed what goes on the
  wire. It's step 5 of the deploy guide.
