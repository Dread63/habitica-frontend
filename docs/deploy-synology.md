# Deploying to a Synology NAS

The shape of this setup: **GitHub Actions builds the image, GHCR stores it, the NAS only ever
pulls.** Nothing is compiled on the NAS — no Node, no npm, no build toolchain — so a low-RAM
model is fine and an update is a pull plus a restart.

```
git push  ─►  GitHub Actions  ─►  ghcr.io/dread63/habitica-frontend:latest  ─►  NAS pulls
              (verify + build)         (multi-arch: amd64 + arm64)              (Container Manager)
```

Two properties make this work, both of which the app was changed to have:

- **No build-time configuration.** Habitica's mandatory `x-client` header used to come from
  `VITE_HABITICA_CLIENT_ID`, baked in at build time, which made every image personal to one
  account. It's now derived from the user id you log in with, so one published image serves
  anyone and there's nothing to set on the NAS.
- **No server-side secrets.** This is a static SPA that calls `habitica.com` directly from the
  browser. Your API token lives in *your browser's* local storage and never touches the NAS.

---

## One-time setup

### 1. Push the workflow

`.github/workflows/publish-image.yml` is already in the repo. Push it:

```sh
git add -A && git commit -m "Publish multi-arch image to GHCR" && git push
```

Watch the run under **Actions** in GitHub. It runs typecheck, lint and the test suite first, and
only publishes if all three pass — a broken build never reaches the registry your NAS pulls from.

The first run takes a few minutes. Later runs are much faster (the layer cache is warm).

### 2. Make the package public

GHCR packages start **private**, and a private package means the NAS needs registry credentials.
Public is simpler and safe here — the image contains only compiled static files and no
account-specific data.

On GitHub: your profile → **Packages** → `habitica-frontend` → **Package settings** →
**Change visibility** → **Public**.

> Prefer to keep it private? Then on the NAS: Container Manager → **Registry** → **Settings** →
> **Add**, URL `https://ghcr.io`, username = your GitHub username, password = a
> [personal access token](https://github.com/settings/tokens) with the `read:packages` scope.
> Everything else below is unchanged.

### 3. Enable Container Manager on the NAS

**Package Center** → search **Container Manager** → Install. (On DSM 7.1 and earlier this package
is called **Docker**; the steps are the same, the menus are named slightly differently.)

### 4. Create the project

Container Manager → **Project** → **Create**.

| Field | Value |
|---|---|
| Project name | `habitica-frontend` |
| Path | create a folder, e.g. `/docker/habitica-frontend` |
| Source | **Create docker-compose.yml** |

Paste this (it's also checked in at `deploy/synology/docker-compose.yml`):

```yaml
services:
  habitica-frontend:
    image: ghcr.io/dread63/habitica-frontend:latest
    container_name: habitica-frontend
    ports:
      - "8080:80"
    restart: unless-stopped
```

Click through **Next** → **Done**. Container Manager pulls the image and starts it.

> **Port 8080** is a suggestion. DSM itself holds **5000/5001**, and Web Station may hold
> **80/443**. If 8080 is taken, change the *left* number only — `"8123:80"` — since 80 is the
> port nginx listens on inside the container.

### 5. Open it

```
http://<your-nas-ip>:8080
```

Log in with your Habitica **User ID** and **API Token** from
<https://habitica.com/user/settings/api>.

> That API token is a bearer credential — treat it like a password. It's stored in the browser
> you log in from, so log in from a device you control, and use **Log out** on shared machines.

Confirm the container reports **healthy** in Container Manager (the image ships its own
healthcheck). Healthy means nginx is actually serving, not just that the container started.

---

## Updating

### The normal path

```sh
git push          # from your machine
```

Actions rebuilds and republishes `:latest`. Then on the NAS:

Container Manager → **Project** → `habitica-frontend` → **Action** → **Build** (or **Reset**,
depending on DSM version). This re-pulls `:latest` and recreates the container.

Hard-refresh the browser tab afterwards (**Ctrl/Cmd+Shift+R**) the first time. `index.html` is
served `no-cache` and hashed assets are immutable, so this shouldn't normally be necessary — but
it rules the browser out if something looks stale.

Your data is unaffected by updates. Habitica tasks live on Habitica's servers; timeline
placements, pomodoro history, tag filters and theme live in your browser's local storage. The
container itself is stateless — nothing is lost by destroying and recreating it.

### Watching a release land

The GitHub **Actions** tab shows whether a push published successfully. If the NAS pull gives you
the old build, check there first — a failing `verify` job means nothing was published, which is
the intended behaviour.

### Rolling back

Every push also publishes a `sha-<short>` tag, and every `v*` git tag publishes that version.
To pin a specific build, change the image line and rebuild the project:

```yaml
    image: ghcr.io/dread63/habitica-frontend:sha-1a2b3c4
```

To cut a proper version:

```sh
git tag v1.0.0 && git push --tags     # publishes :v1.0.0 alongside :latest
```

### Automating it (optional)

If you'd rather not click Build after every push, add Watchtower as a second project. It polls
the registry and recreates the container when `:latest` changes:

```yaml
services:
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 3600 --cleanup habitica-frontend
```

Naming `habitica-frontend` at the end scopes it to this one container, so it can't restart
anything else you run on the NAS. Note the tradeoff: updates land without you choosing the
moment, so a bad `:latest` reaches the NAS on its own.

---

## Verification record

Run against a real Docker daemon (29.7.2) from this checkout, not inspected:

- `docker build` completes; final image **74.8 MB**
- `/healthz` returns `ok`, and the container reports **healthy** on its first probe
- a client-routed path (`/timeline`) returns `200 text/html` — the SPA fallback works
- `index.html` serves `Cache-Control: no-cache`; hashed assets serve
  `public, max-age=31536000, immutable`
- `docker buildx build --platform linux/amd64,linux/arm64` succeeds, and the Node build runs
  **once**, natively — only the small nginx layers are built per architecture (see the
  `--platform=$BUILDPLATFORM` comment in the Dockerfile)

**Not verified:** logging in against a real Habitica account from inside the container. That
exercises `src/lib/habitica/client.ts` against the live API rather than anything
Docker-specific, so it's a separate check — and it's the one you'll do first anyway at step 5.

---

## Troubleshooting

**Container Manager won't pull — "denied" or "unauthorized".**
The package is still private. Either make it public (setup step 2) or add the ghcr.io registry
credentials described there.

**"manifest unknown".**
The workflow hasn't published yet, or published under a different name. The image name is
case-sensitive and must be lowercase: `ghcr.io/dread63/habitica-frontend`. Check the **Packages**
tab on GitHub for the exact path.

**Container starts but the page won't load.**
Check the port isn't already claimed: SSH in and run `sudo netstat -tulpn | grep 8080`. Change
the host-side port in the compose file if something else holds it.

**Container reports unhealthy.**
Check the logs in Container Manager. Worth knowing: the healthcheck deliberately probes
`127.0.0.1`, not `localhost` — busybox `wget` resolves `localhost` to `::1` first, and nginx here
binds only the IPv4 wildcard, so a `localhost` probe fails on every check while the app works
fine from outside. That bug is fixed; the comment in the Dockerfile explains it so it doesn't get
reintroduced.

**Login fails with a 401.**
Re-copy the User ID and API Token from <https://habitica.com/user/settings/api>. Both are
required, and the token is regenerated if you ever click "Reset API Token" there.

---

## Adding HTTPS later

Not required on a LAN, and nothing about the container changes if you add it:

1. DSM → **Control Panel** → **Login Portal** → **Advanced** → **Reverse Proxy** → **Create**
2. Source: `habitica.<your-nas>.synology.me`, HTTPS, port 443
3. Destination: `localhost`, port `8080`
4. **Control Panel** → **Security** → **Certificate** to issue a Let's Encrypt cert for that
   hostname

Leave the container on plain HTTP internally — the reverse proxy terminates TLS in front of it.
