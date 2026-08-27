# Deploying to a Synology NAS

The shape of this setup: **GitHub Actions builds the images, GHCR stores them, the NAS only ever
pulls.** Nothing is compiled on the NAS — no Node, no npm, no build toolchain — so a low-RAM
model is fine and an update is a pull plus a restart.

```
git push  ─►  GitHub Actions  ─►  ghcr.io/dread63/habitica-frontend      ─►  NAS pulls
              (verify + build)     ghcr.io/dread63/habitica-frontend-api      (Portainer or
                                   (multi-arch: amd64 + arm64)                 Container Manager)
```

**The stack is two containers plus one folder:**

| | what it does | holds data? |
|---|---|---|
| `web` | nginx serving the app; proxies `/api/` to the service below | no — fully disposable |
| `api` | sync + export service, owns one SQLite file | **yes — via a volume** |
| `./data` | the volume: your timeline and your entire focus history | **back this up** |

Three properties make this work:

- **No build-time configuration.** Habitica's mandatory `x-client` header used to come from
  `VITE_HABITICA_CLIENT_ID`, baked in at build time, which made every image personal to one
  account. It's now derived from the user id you log in with, so one published image serves
  anyone and there's nothing to set on the NAS.
- **Your Habitica token still never touches the NAS.** The browser talks to `habitica.com`
  directly for tasks; the NAS only ever sees timeline placements and focus history.
- **The app still works with no server at all.** localStorage remains the working copy, so the
  frontend container runs standalone, and an unreachable NAS degrades to "changes saved locally,
  uploaded on reconnect" rather than an error screen.

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
placements and focus history live in `./data` on the NAS; UI preferences (theme, density, rail
collapse) stay in the browser. Both containers are stateless — nothing is lost by destroying and
recreating them, as long as the volume stays put.

> **One thing to be careful with:** `docker compose down -v` (or Portainer's "delete volumes"
> checkbox) removes volumes. On a bind mount like `./data` your files survive that, but don't
> make a habit of relying on it.

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

## Your data: where it lives, and getting it out

Everything the app records about your time is in one SQLite file:

```
<project folder>/data/focus.sqlite      (+ -wal and -shm alongside it)
```

Two tables matter. `timeline_entries` holds your placements and is mutable. `focus_sessions` is
the audit trail and is **append-only by construction** — the server has no UPDATE path for it at
all, so a recorded session can't later be quietly restated. That's what makes the log worth
something as evidence rather than just as data.

### Backing it up

Point **Hyper Backup** at the project folder. It's a handful of files and it compresses well.

For a portable copy that doesn't depend on SQLite, on Docker, or on this app continuing to
exist, use the exports below — that's what they're for.

### Exporting

In the app: the pomodoro timer → **Data** tab → **Download CSV** / **Download JSON backup**.
Or hit the endpoints directly, which is handy for a scheduled backup:

```sh
curl -H "X-Habitica-User-Id: <your-user-id>" \
     "http://<nas-ip>:8080/api/export.csv" -o focus-log.csv

# a bounded range, for a review period
curl -H "X-Habitica-User-Id: <your-user-id>" \
     "http://<nas-ip>:8080/api/export.csv?from=2026-01-01&to=2026-03-31" -o q1.csv
```

**The CSV is one row per task per session**, not per session:

| date | weekday | start_local | end_local | minutes | task | categories | completed_full_session |
|---|---|---|---|---|---|---|---|
| 2026-08-27 | Thursday | 09:00 | 09:25 | 10.00 | Ship sync | Work | yes |
| 2026-08-27 | Thursday | 09:00 | 09:25 | 15.00 | Write docs | School | yes |

That shape is the point: a 25-minute block split across two tasks becomes two rows of 10 and 15,
so summing `minutes` by `categories` or by `task` in a pivot gives real totals instead of
counting the block twice. Tag ids are resolved to names, and times are rendered in your local
zone alongside the UTC instants, so the file stands on its own.

The JSON export is the complete server-side state in the shapes the app understands — the one to
keep if you ever rebuild the NAS.

---

## Security

The api service takes the `X-Habitica-User-Id` header at face value. It never sees your API
token and never contacts Habitica, but it also **does not verify that you are who the header
says**. Anyone who can reach that service and knows a user id can read and write that user's
focus data.

That was a deliberate trade — it keeps your token in the browser where it started — and it's
fine on a home LAN. Two consequences worth respecting:

- The compose file gives the api service `expose:` rather than `ports:`, so it is reachable only
  from the web container, not from your network directly. Leave it that way.
- **Don't port-forward this to the internet.** If you ever want off-LAN access, put it behind a
  VPN (Synology has WireGuard/OpenVPN packages) or a reverse proxy that does its own
  authentication. Adding real auth to the service is a change worth making first.

---

## Verification record

Run against a real Docker daemon (29.7.2) from this checkout, not inspected:

- `docker compose build` completes for both images; the web image is **74.8 MB**
- both containers report **healthy**
- `/` and a client-routed path (`/timeline`) both return `200 text/html` — SPA fallback works
- `index.html` serves `Cache-Control: no-cache`; hashed assets serve
  `public, max-age=31536000, immutable`
- `/api/health` answers **through the nginx proxy**, same-origin
- a push from one "device" is visible to a second one that had nothing — the actual cross-device
  claim, tested rather than assumed
- the CSV export splits a 25-minute session into 10 + 15 minute rows with tag ids resolved to
  names and times in the requested zone
- data survives `docker compose restart api` — it's on the volume, not in the container
- **with the api container stopped, the frontend still serves `200`** and `/api/` returns 502,
  which the client treats as "offline, saved locally". Running the web container alone remains
  supported
- `docker buildx build --platform linux/amd64,linux/arm64` succeeds, and the Node build runs
  **once**, natively — only the small nginx layers are built per architecture (see the
  `--platform=$BUILDPLATFORM` comment in the Dockerfile)

A real bug this run caught, worth recording because inspection would never have found it: with
`USER node` in the api Dockerfile and a bind-mounted `./data`, the container crash-looped on
`unable to open database file`. The host directory arrives owned by root when Docker auto-creates
it, and a build-time `chown` is invisible because the bind mount is layered over the image at run
time. Fixed with an entrypoint that fixes ownership and then drops privileges via `su-exec`.

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
