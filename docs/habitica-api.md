# Habitica API v3 — reference for this project

Curated for the Habitica frontend rebuild. Covers only what this app calls — not guilds, chat,
market, quests, or challenges administration. Full ground truth for everything below lives in
`vendor/` (real Habitica source files) and `openapi.yaml` (community-maintained full spec);
this file exists so you don't have to open those for routine work.

**Do not fetch `apidoc.habitica.com` directly.** It's a client-rendered SPA — confirmed
firsthand that `WebFetch` and most non-browser tools only ever get back `"Loading..."`. If
something here is insufficient, go to `vendor/` or `openapi.yaml` first; only reach for a live
fetch against the raw GitHub source (`raw.githubusercontent.com/HabitRPG/habitica/develop/...`)
if those are also insufficient — that URL pattern **does** work with fetch tools (unlike the
docs site) since it's plain text, not a rendered app.

---

## Base URL, auth, transport

```
https://habitica.com/api/v3/
```

**Why v3 and not v4.** Habitica's own web client actually calls `/api/v4/...` for everything —
but confirmed directly from their route-mounting source (`vendor/appRoutes.js`): *"API v4 proxies
API v3 routes by default. It can also disable or override v3 routes."* Concretely, `v4Router`
walks the exact same `api-v3/` controller files first, then layers `api-v4/` on top. For every
task/tag route this project uses, v3 and v4 run **identical handler code** — there is no
behavioral difference to chase. v4 adds exactly one task-related extra
(`POST /tasks/bulk-score` — score multiple tasks in one call, vendored at
`vendor/api-v4-tasks.js`) and overrides a short list of non-task routes (`GET`/`PUT /user`,
registration, `/news`, class-cast, rebirth/reset/reroll, messages, coupons — full list in
`vendor/appRoutes.js`'s `v4RouterOverrides`). Every v4-only or v4-overridden route is marked
`@apiIgnore` in their source — deliberately excluded from the public apidoc — which reads as
"this is our own client's internal surface, not a documented third-party contract." **v3 stays
the base URL for that reason**: it's the version Habitica publishes and supports for outside
integrations. `bulk-score` is a plausible future optimization (fewer requests against the rate
limit) but would mean relying on undocumented, `@apiIgnore`d behavior — not worth it unless
scoring-heavy usage actually demands it.

One genuinely useful thing this detour surfaced: **`GET /user` (v3, the one we use) accepts a
`?userFields=` query param** — a comma-separated field list to return instead of the entire user
document (documented in `vendor/user.controller.js` right where `api.getUser` is defined; easy to
miss since it's just one line in a huge file, which is exactly how this got missed the first
time). Since this project only needs a handful of fields (see § User below), every `/user` call
should use it, e.g. `GET /user?userFields=preferences,stats,profile.name` — meaningfully smaller
payload than pulling the full document (achievements, full inventory, party, purchase history,
etc.) every time.

Every authenticated request needs **three** headers:

| Header | Value | Notes |
|---|---|---|
| `x-api-user` | the user's Habitica User ID | from `habitica.com/user/settings/api` |
| `x-api-key` | the user's API Token | same page. This is a bearer credential — treat it like a password. |
| `x-client` | `<your-habitica-user-id>-<appname>` | **Mandatory as of mid-2025 — requests without it are rejected outright.** This is *your* (the developer's) Habitica User ID plus a name for this app, e.g. `4c079...-habitica-modern-frontend`. It's not auto-generated; bake it in once via `VITE_HABITICA_CLIENT_ID`. |

**CORS — confirmed open, verified directly against the live API (not assumed):**

```
$ curl -i -X OPTIONS https://habitica.com/api/v3/user \
    -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: x-api-user,x-api-key,x-client,content-type"

access-control-allow-origin: *
access-control-allow-methods: OPTIONS,GET,POST,PUT,HEAD,DELETE
access-control-allow-headers: Authorization,Content-Type,Accept,Content-Encoding,X-Requested-With,x-api-user,x-api-key,x-client
access-control-expose-headers: X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After
```

This confirms the architecture decision in the implementation plan: **no backend/proxy needed.**
The SPA can call `habitica.com/api/v3` directly from the browser. `access-control-expose-headers`
also confirms the rate-limit headers are readable from `fetch()`/`Response.headers` client-side —
build the rate limiter against them directly rather than guessing at remaining quota.

---

## Rate limit — build this into the client from day one

**30 requests per 60 seconds**, per user (and per IP as a secondary limit). Every response carries:

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | always `30` |
| `X-RateLimit-Remaining` | requests left in the current window |
| `X-RateLimit-Reset` | when the window resets |

Exceeding it returns `429` with a `Retry-After` header (seconds to wait). **The API client must
queue/back off on 429 using `Retry-After`, not just fail** — a burst of task-scoring clicks or an
initial full-app data load can realistically hit this limit.

---

## Response envelope

Every response is wrapped:

```json
{ "success": true, "data": { /* or [] */ }, "notifications": [] }
```

Errors:

```json
{
  "success": false,
  "error": "BadRequest",
  "message": "todo validation failed",
  "errors": [{ "message": "Path `text` is required.", "path": "text" }]
}
```

`401` for bad/missing credentials, `400` for validation errors (with the `errors[]` breakdown
above), `404` for not-found, `429` for rate limit. Unwrap `data` in the API client layer so the
rest of the app never touches the envelope directly.

---

## Endpoints this app uses

### Tasks

| Method | Path | Purpose | Example |
|---|---|---|---|
| GET | `/tasks/user` | List the user's tasks. Query params below. | `api-examples/tasks-list-response.json` |
| GET | `/tasks/:taskId` | Get one task (by `_id` or `alias`) | — |
| POST | `/tasks/user` | Create a task (single object or array of objects) | `api-examples/task-create-response.json` |
| PUT | `/tasks/:taskId` | Update a task | — |
| DELETE | `/tasks/:taskId` | Delete a task | — |
| POST | `/tasks/:taskId/score/:direction` | Score a task. `direction` is `up` or `down`. **Response is the user's updated stats, not the task** — see below. | `api-examples/score-task-response.json` |
| POST | `/tasks/:taskId/move/to/:position` | Reorder within its list (0-indexed) | — |
| POST | `/tasks/:taskId/checklist` | Add a checklist item | — |
| PUT | `/tasks/:taskId/checklist/:itemId` | Update a checklist item | — |
| POST | `/tasks/:taskId/checklist/:itemId/score` | Toggle a checklist item done/not done | — |
| DELETE | `/tasks/:taskId/checklist/:itemId` | Remove a checklist item | — |
| POST | `/tasks/:taskId/tags/:tagId` | Add a tag to a task | `api-examples/task-tag-link-response.json` |
| DELETE | `/tasks/:taskId/tags/:tagId` | Remove a tag from a task | `api-examples/task-tag-link-response.json` |
| POST | `/tasks/clearCompletedTodos` | Bulk-delete completed to-dos | — |

**`GET /tasks/user` query params — this is the entire server-side filter surface:**

| Param | Values | Notes |
|---|---|---|
| `type` | `habits` \| `dailys` \| `todos` \| `rewards` \| `completedTodos` \| `_allCompletedTodos` (beta) | Optional. Omit to get everything except completed todos (those need a separate request). `completedTodos` returns only the 30 most recent. |
| `dueDate` | date | Optional — used to compute `nextDue` on returned dailies. |
| `history` | boolean | Optional. |

**There is no `tags` filter parameter, and never has been.** This is the confirmed reason the
tag-filter engine (OR/AND/exclude — see the implementation plan) has to be, and can only be,
client-side: fetch the full task list once, filter locally. This is a feature of the API's
simplicity, not a gap to work around.

### Tags

Tags are **not** a separate top-level resource in storage — they live on `user.tags[]` — but the
API exposes conventional CRUD for them:

| Method | Path | Purpose | Example |
|---|---|---|---|
| GET | `/tags` | List all tags, in display order | `api-examples/tags-response.json` |
| GET | `/tags/:tagId` | Get one tag | — |
| POST | `/tags` | Create (`{"name": "..."}`) | `api-examples/tags-response.json` |
| PUT | `/tags/:tagId` | Rename | `api-examples/tags-response.json` |
| DELETE | `/tags/:tagId` | Delete — also strips the tag from every task that had it | `api-examples/tags-response.json` |
| POST | `/reorder-tags` | Reorder (`{"tagId": "...", "to": <index>}`) | `api-examples/tags-response.json` |

### User (only the fields this app needs)

`GET /user` returns the full user document by default — large (equipment, party, purchase
history, etc.). **Use `?userFields=` to request only what's relevant** (see § Base URL above):
`preferences.dayStart` (hour 0–23 daily reset happens), `preferences.timezoneOffset`, `stats`
(hp/mp/exp/gp/lvl — needed to show reward affordability and habit scoring feedback),
`profile.name`. Don't build UI around the rest of the user object unless a later phase
(party/guild/equipment) needs it — and when it does, request those fields explicitly rather than
dropping the filter and pulling everything.

---

## Data shapes

### Task — base fields (all types)

| Field | Type | Notes |
|---|---|---|
| `id` / `_id` | UUID | same value, both present |
| `type` | `"habit"` \| `"daily"` \| `"todo"` \| `"reward"` | required |
| `text` | string | required — the task title |
| `notes` | string | default `""` |
| `alias` | string | optional short name, alphanumeric/underscore/dash only, unique per user |
| `tags` | `string[]` | array of tag UUIDs |
| `value` | number | "redness" — Habitica's internal score used for habit/daily color intensity. **Only directly settable for `reward`** (the cost in gold); for other types it's server-managed via scoring, and the API strips any client-sent `value` on update unless `type === "reward"`. |
| `priority` | `0.1 \| 1 \| 1.5 \| 2` | Trivial / Easy / Medium / Hard — no other values accepted |
| `attribute` | `"str" \| "int" \| "per" \| "con"` | default `"str"` |
| `challenge` / `group` | object | populated only if the task belongs to a challenge/party — `{}` otherwise |
| `reminders` | array of `{id, startDate, time}` | |
| `createdAt` / `updatedAt` | ISO date | |

**Not client-settable via `PUT` (server-managed):** `challenge`, `userId`, `completed`, `history`,
`dateCompleted`, `group`, `isDue`, `nextDue`. `completed` changes via the score endpoint / checklist
scoring, not a direct field write.

### Habit-specific

`up` (bool, default true), `down` (bool, default true), `counterUp`, `counterDown` (numbers),
`frequency` (`daily`\|`weekly`\|`monthly`), `history[]` (`{date, value, scoredUp, scoredDown}`).

### Daily-specific

`frequency` (`daily`\|`weekly`\|`monthly`\|`yearly`), `everyX`, `startDate`, `repeat` (`{m,t,w,th,f,s,su}` booleans,
only meaningful for `frequency: "weekly"`), `streak`, `daysOfMonth[]`, `weeksOfMonth[]`, `isDue`,
`nextDue[]`, `yesterDaily`, plus the daily/todo shared block below.

### Todo-specific

`date` (due date, optional), `dateCompleted`, plus the daily/todo shared block below.

### Daily/todo shared block

`completed` (bool), `collapseChecklist` (bool), `checklist[]` — each item `{id, text, completed, linkId?}`.

### `value` → display color (habits/dailies/todos age visibly — this is not cosmetic, implement it)

`value` isn't just an internal score — it's what makes a neglected habit visibly "redden" and a
well-kept one "bluen" over time, which is core to how Habitica actually reads at a glance. Ported
from Habitica's own client (`getTaskColor()`), source vendored at `vendor/task-color.getter.js`;
hex values from `vendor/task-colors.scss` + `vendor/task-style.scss` (not approximated):

| `value` | Bucket | Accent hex | Text/icon hex |
|---|---|---|---|
| `< -20` | worst | `#DE3F3F` | `#6C0406` |
| `-20 to < -10` | worse | `#FF6165` | `#6C0406` |
| `-10 to < -1` | bad | `#FF944C` | `#7F3300` |
| `-1 to < 1` | neutral | `#FFBE5D` | `#794B00` |
| `1 to < 5` | good | `#24CC8F` | `#005737` |
| `5 to < 10` | better | `#3BCAD7` | `#005158` |
| `>= 10` | best | `#50B5E9` | `#033F5E` |
| any (rewards, or `byHabitica: true`) | purple | `#925CF3` | `#FFFFFF` |

Boundaries are `<`, not `<=` — e.g. exactly `-20` falls into "worse", not "worst". App
implementation: `src/features/tasks/taskColor.ts` (unit-tested at every boundary).

### Reward-specific

No extra fields beyond the base — `value` is the gold cost.

### Tag

```ts
{ id: string /* UUID */, name: string, challenge?: boolean, group?: string }
```

That's the whole object. `challenge`/`group` only appear on tags auto-created for challenge/group
participation — user-created tags are just `{id, name}`.

---

## Footguns — things that silently break generated code if missed

1. **Missing `x-client` header → hard rejection.** Not optional, not a warning.
2. **No backoff on `429` → the app appears to randomly stop working** under normal use (loading
   the dashboard + scoring a few tasks can approach 30 requests). The client must read
   `Retry-After` and requeue.
3. **Tags are not an independent resource** — they're `user.tags[]`. Deleting a tag cascades a
   `$pull` across every task that referenced it server-side; the client doesn't need to clean
   this up itself, but should expect a task's `tags[]` to shrink on the next fetch after a tag
   delete, not error.
4. **`GET /tasks/user` has no tag filter.** Don't build a request that tries to pass `tags=` —
   it's silently ignored (or rejected by the query-param allowlist). Filter client-side, always.
5. **`priority` only accepts exactly `0.1, 1, 1.5, 2`** — anything else is a `400`.
6. **`value` is stripped from `PUT` requests except on rewards.** Don't build an "edit task"
   form that sends `value` for habits/dailies/todos expecting it to matter — score the task
   instead.
7. **The score endpoint's response is *user stats*, not the task.** `POST /tasks/:id/score/:dir`
   returns `{delta, _tmp, hp, mp, exp, gp, lvl, ...}` — if the UI needs the task's new `completed`/
   `value`, re-derive it locally (toggle `completed`, adjust `value` by `delta`) rather than
   expecting the response to contain a task object.
8. **`tagId` on `POST /tasks/:taskId/tags/:tagId` must already exist in `user.tags`** — the server
   validates it's a UUID *and* that it's in the user's own tag list, not just any UUID.

---

## Where the ground truth for anything not covered here lives

| Need | Look in |
|---|---|
| Exact Mongoose field types/enums/defaults for Task | `vendor/task.model.js` |
| Exact Mongoose field types/enums/defaults for Tag | `vendor/tag.model.js` |
| User preferences/stats/profile field shapes | `vendor/user.schema.js` |
| Route definitions + official `@apiSuccessExample` blocks (source of the JSON in `api-examples/`) | `vendor/tasks.controller.js`, `vendor/tags.controller.js` |
| `value` → display color logic + exact hex values | `vendor/task-color.getter.js`, `vendor/task-colors.scss`, `vendor/task-style.scss` |
| Why v3 (not v4), what v4 actually adds/overrides | `vendor/appRoutes.js`, `vendor/api-v4-tasks.js`, `vendor/api-v4-user.js` |
| Full OpenAPI spec (community-maintained, generated from Habitica's docs) | `vendor/openapi.yaml` |
| Anything not in any of the above | `raw.githubusercontent.com/HabitRPG/habitica/develop/website/server/...` — this URL pattern works with fetch tools; `apidoc.habitica.com` does not |
