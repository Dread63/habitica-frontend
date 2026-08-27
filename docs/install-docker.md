# Installing with Docker

How to actually run this thing. For how the images get *built and published*, see
[deploy-synology.md](deploy-synology.md).

---

## What you're installing

Two containers and one folder:

| | what it is | needs a folder? |
|---|---|---|
| **web** | nginx serving the app; also proxies `/api/` to the service below | no |
| **api** | sync + export service; owns one SQLite file | **yes** |

Both containers are disposable — you can delete and recreate them freely. **The folder is the
only thing that holds your data**, and it's the only thing you need to back up.

You can run **web on its own** if you don't want sync. The app falls back to browser storage,
which is per-device and per-URL. Everything below assumes you want both.

---

## Folders: what to create, and where

You need **one** folder. Everything else is created for you.

```
<wherever you keep docker projects>/
└── habitica-frontend/            ← the project folder (you create this)
    ├── docker-compose.yml        ← you put this here
    └── data/                     ← created automatically on first run
        ├── focus.sqlite          ← YOUR TIMELINE + FOCUS HISTORY
        ├── focus.sqlite-wal      ← SQLite write-ahead log
        └── focus.sqlite-shm      ← SQLite shared-memory index
```

Where to put the project folder:

| Platform | Suggested path |
|---|---|
| Synology DSM | `/volume1/docker/habitica-frontend` |
| Linux | `/opt/habitica-frontend` or `~/docker/habitica-frontend` |
| Unraid | `/mnt/user/appdata/habitica-frontend` |
| macOS / Windows (Docker Desktop) | anywhere in your home directory |

On Synology, create it once in **File Station** under the existing `docker` shared folder. If
that shared folder doesn't exist, Container Manager creates it when you install it.

**You do not need to create `data/` yourself, or set its permissions.** Docker creates the
directory on first run, and the api container fixes its ownership at startup. That last part is
deliberate: a bind mount is layered over the image at *run* time, so any `chown` done while
building the image would be invisible by then — a mistake that made an early version of this
crash-loop on `unable to open database file` with nothing in the logs pointing at permissions.

> `data/` is a **bind mount**, not a Docker named volume, specifically so you can see the files,
> copy them, and point a backup task at them without going through Docker.

---

## Install

### Plain Docker (any Linux box, Docker Desktop, or SSH on a NAS)

```sh
mkdir -p ~/docker/habitica-frontend && cd ~/docker/habitica-frontend
curl -O https://raw.githubusercontent.com/Dread63/habitica-frontend/master/deploy/docker-compose.yml
docker compose up -d
```

Then open `http://<host-ip>:8080`.

### Portainer

1. **Stacks** → **Add stack** → name it `habitica-frontend`
2. **Web editor**, paste the compose below
3. **Deploy the stack**

Portainer keeps the stack's working directory under its own data volume, so `./data` resolves
inside there. If you'd rather control exactly where the file lands (recommended — it makes
backups obvious), replace `./data` with an absolute path:

```yaml
    volumes:
      - /volume1/docker/habitica-frontend/data:/data
```

### Synology Container Manager

1. **Package Center** → install **Container Manager** (called **Docker** on DSM 7.1 and earlier)
2. **Project** → **Create**
3. Project name `habitica-frontend`, path `/volume1/docker/habitica-frontend`
4. Source: **Create docker-compose.yml**, paste the compose below
5. **Next** → **Done**

### The compose file

Also checked in at [`deploy/docker-compose.yml`](../deploy/docker-compose.yml).

```yaml
services:
  web:
    image: ghcr.io/dread63/habitica-frontend:latest
    container_name: habitica-frontend
    ports:
      - "8080:80"
    restart: unless-stopped
    depends_on:
      - api

  api:
    image: ghcr.io/dread63/habitica-frontend-api:latest
    container_name: habitica-frontend-api
    volumes:
      - ./data:/data
    restart: unless-stopped
    expose:
      - "8081"
```

**About that port.** `8080:80` is `host:container`. Only change the left number — `80` is the
port nginx listens on inside the container. Ports commonly already taken: DSM holds **5000/5001**,
Synology Web Station may hold **80/443**, Portainer usually sits on **9000/9443**.

**The api service has no `ports:` on purpose.** It's reachable only from the web container
through the `/api/` proxy. It has no authentication of its own — see [Security](#security).

---

## First run

1. Open `http://<host-ip>:8080`
2. Log in with your Habitica **User ID** and **API Token** from
   <https://habitica.com/user/settings/api>
3. Open the pomodoro timer → **Data** tab. It should say **Synced**.

If it says *"This device only"*, the web container can't reach the api container — see
[Troubleshooting](#troubleshooting). The app still works; it just won't sync.

> Your API token is a bearer credential — treat it like a password. It's stored in the browser
> you log in from and **never sent to your server**; the app talks to habitica.com directly.

**Pick one URL and stick to it.** Browser-side preferences (theme, density, rail state) are
scoped per origin, so `http://192.168.1.50:8080` and `http://nas.local:8080` are different
"sites" to the browser. Your timeline and focus history follow you regardless — that's the point
of the api container — but the UI preferences won't.

---

## Your data

Everything the app records about your time is in `data/focus.sqlite`.

- `timeline_entries` — your scheduled blocks. Mutable.
- `focus_sessions` — the audit trail. **Append-only by construction**: the server has no SQL
  UPDATE path for it, so a recorded session can't later be quietly restated.

**Back up the whole project folder.** On Synology, point a **Hyper Backup** task at
`/volume1/docker/habitica-frontend`. It's a handful of small files.

For a copy that doesn't depend on SQLite, Docker, or this app continuing to exist, use the
exports — pomodoro timer → **Data** tab → **Download CSV** / **Download JSON backup**, or:

```sh
curl -H "X-Habitica-User-Id: <your-user-id>" \
     "http://<host-ip>:8080/api/export.csv" -o focus-log.csv
```

---

## Updating

```sh
docker compose pull && docker compose up -d
```

**Portainer:** Stacks → `habitica-frontend` → **Update the stack**, with **Re-pull image**
turned **on**. Without that toggle Portainer recreates the container from the image it already
has cached and nothing changes — the single most common "the update didn't work" cause.

**Container Manager:** Project → `habitica-frontend` → **Action** → **Build**.

Your data folder is untouched by updates.

> Avoid `docker compose down -v` out of habit — `-v` removes volumes. A bind mount like `./data`
> survives it, but don't rely on that.

---

## Security

The api service identifies you by an `X-Habitica-User-Id` header and **takes it at face value**.
It never sees your Habitica token and never contacts Habitica, but it also can't verify you are
who the header claims. Anyone who can reach it and knows a user id can read and write that user's
focus data.

That's a deliberate trade — it keeps your token in the browser where it started — and it's fine
on a home LAN. Two things follow:

- Keep `expose:` on the api service rather than `ports:`. It should be reachable only from the
  web container.
- **Don't port-forward this to the internet.** For off-LAN access use a VPN (Synology ships
  WireGuard/OpenVPN packages) or a reverse proxy that does its own authentication.

---

## Troubleshooting

**`denied` when pulling `habitica-frontend-api`.**
GHCR reports both *private* and *does not exist* as `denied`, so this reads like a permissions
bug either way. **The two images are separate packages with separate visibility** — making
`habitica-frontend` public does not make `habitica-frontend-api` public. Fix: GitHub → your
profile → **Packages** → `habitica-frontend-api` → **Package settings** → **Change visibility** →
**Public**. If the package isn't listed at all, it was never published — check the repo's
**Actions** tab.

To keep it private instead, authenticate the host once:
```sh
echo '<GITHUB_PAT_with_read:packages>' | docker login ghcr.io -u <github-username> --password-stdin
```

**Data tab says "This device only".**
The web container can't reach the api container. Check both are running (`docker compose ps`) and
that they're in the same stack — the proxy resolves the api service by the hostname `api`, so
renaming that service in the compose file breaks it. `curl http://<host-ip>:8080/api/health`
should return `{"status":"ok"}`.

**api container restarting, logs show `unable to open database file`.**
Permissions on the data folder. The entrypoint normally fixes this; if it can't (an
unusual mount, a read-only filesystem, some NAS ACL setups), set ownership yourself:
```sh
sudo chown -R 1000:1000 /volume1/docker/habitica-frontend/data
```

**Port already in use.**
`sudo netstat -tulpn | grep 8080`, then change the left-hand number in `ports:`.

**Container is up but the page won't load.**
Confirm you're using the mapped host port, and check `docker compose logs web`.

**Login fails with 401.**
Re-copy both the User ID and API Token from <https://habitica.com/user/settings/api>. The token
is regenerated if you ever click "Reset API Token" there.
