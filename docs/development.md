# Development environment

Since the `api/` service was added, "run the app locally" has two halves: the Vite dev server
for the frontend, and a Node process holding the SQLite database. **The frontend works without
the api** — localStorage is the working copy and sync only mirrors it — so which setup you want
depends on what you're changing.

## Pick a setup

| You're working on | Run | Sync |
|---|---|---|
| UI, tasks, tags, layout — most work | `npm run dev` | off, cleanly |
| Sync, export, timeline/pomodoro persistence, anything in `api/` | `npm run dev:api` **and** `npm run dev` in two terminals | on, against a local scratch db |
| Verifying the real container behaviour (nginx, healthchecks, the entrypoint) | `docker compose up --build` | on, against `./.local-data` |

### 1. Frontend only

```sh
npm run dev
```

`/api/*` requests get a **503** from the dev proxy, `probeSync()` returns false, and the app
takes its designed offline path: everything saves to localStorage, the status shows unavailable,
and no further requests are made. One line of proxy noise on load, then silence.

### 2. Frontend + api

```sh
npm run dev:api     # terminal 1 — :8081, db at ./.local-data/focus.sqlite
npm run dev         # terminal 2 — :5173, proxies /api → :8081
```

`dev:api` needs **Node ≥ 24** (`node:sqlite` is a core module; there is nothing to install and
no native build). The database file and its directory are created on first run —
`.local-data/` is gitignored, so it's scratch data you can delete at any time.

### 3. Against a different api

```sh
FOCUS_API_TARGET=http://nas.local:8080 npm run dev
```

Useful for reproducing something with real data. **It writes to that database** — it's a normal
sync, not a read-only view. Export a backup first if the target matters.

## How `/api/` is resolved, and why the proxy exists

In production **nginx** proxies `/api/` to the api container (`nginx.conf`). There is no nginx
in `npm run dev`, so `vite.config.ts` declares an equivalent `server.proxy`.

This is not just convenience — without it there was a real bug. Vite's SPA fallback answers any
unmatched path with **`index.html` and a 200**, so:

- `GET /api/health` → 200 `text/html` → `probeSync()` reads `response.ok` as **true**
- the app concludes sync is available and starts its debounce + 60s poll
- every `POST /api/sync` → **404** → `SyncUnavailableError` → permanent "Offline"

A failing proxy is strictly better than a lying fallback: it returns 503, `probeSync()` returns
false, and the app never starts polling.

**`FOCUS_API_TARGET` is deliberately not a `VITE_` variable.** `VITE_*` vars are inlined into
the client bundle at build time, and this app has [zero build-time
configuration](gotchas.md#habitica-api) on purpose. This one is read by the dev-server process
only and never reaches the browser or a production build. Don't rename it with a `VITE_` prefix.

## Working with the local database

```sh
sqlite3 .local-data/focus.sqlite '.tables'
sqlite3 .local-data/focus.sqlite 'select id, started_at, ended_at from time_entries'
rm -rf .local-data                      # reset to empty; it rebuilds on next start
```

Or without installing `sqlite3`, using Node's built-in:

```sh
node -e "const {DatabaseSync}=require('node:sqlite');
  const d=new DatabaseSync('./.local-data/focus.sqlite');
  console.log(d.prepare('select * from time_entries').all())"
```

Hitting the service directly, bypassing the proxy:

```sh
curl localhost:8081/api/health
curl localhost:8081/api/sync       -H 'X-Habitica-User-Id: dev-local-user'
curl localhost:8081/api/export.csv -H 'X-Habitica-User-Id: dev-local-user'
```

**The user id must be 8–64 characters, `[A-Za-z0-9-]` only** (`userIdOf` in `server.js`) — a
short one like `devuser` is rejected with a 400 that reads like a missing header. Data is
partitioned by this id, so a dev id keeps scratch data away from anything real.

## Gotchas that cost time

**Stopping `npm run dev:api` may not stop the server.** npm spawns a shell which spawns node;
killing the npm process can leave the node child listening on 8081. Worse, on Linux a deleted
database file stays alive while a process holds it open — so you can `rm -rf .local-data`, start
a fresh server, and still be talking to the *old* orphaned one. If results look impossible:

```sh
ss -lntp 'sport = :8081'        # who actually holds the port  (lsof -i :8081 on macOS)
```

and kill that PID directly. Ctrl-C in the terminal is reliable; backgrounding it is not.

**The api tests run under vitest, not `node --test`.** `api/src/*.test.js` use
`// @vitest-environment node` and import from `vitest`, and the root `npm test` already picks
them up in one pass, frontend and api together. Don't add a separate api test script.

**`api/` has no build step and no dependencies.** `node src/server.js` runs the source. Don't
add a bundler, and think hard before adding a dependency — zero deps is what makes the
multi-arch image build with no native compilation.

## Before you call something done

```sh
npm run verify     # typecheck && lint && test && build
```

Then say what you did *not* verify. No browser automation has ever been available in this
project, so anything about rendered behaviour is reasoned rather than observed — see
[`docs/conventions.md`](conventions.md).

For changes touching sync, the check that actually matters is two "devices" against one api:
open the app in two browser profiles pointed at the same `FOCUS_API_TARGET`, change something in
one, and confirm it lands in the other within the 60s poll. This has still never been done with
two real machines.
