# Gotchas — the traps, indexed

Every rule here was paid for with a real bug. Each entry is: **the rule**, why it exists, and
where it's enforced. This file exists so the reasoning doesn't have to be rediscovered by
breaking something again.

Read the section matching what you're touching. If you're touching something not listed, you
probably don't need any of this.

**When this file and `docs/history/` disagree, this file wins.** The history is chronological
and later rounds contradict earlier ones; this is the reconciled present tense.

---

## Habitica API

**Every request needs an `x-client` header** — `<user-id>-<appname>`, or it's rejected outright.
It is *derived* in `client.ts` as `${credentials.userId}-habitica-modern-frontend`, from the
same id already going out as `x-api-user`. Not configured.
→ `src/lib/habitica/client.ts`

**The app has zero build-time configuration. Keep it that way.** `VITE_HABITICA_CLIENT_ID` was
removed for this reason. Any `VITE_*` var has to be baked in before the bundle is built, which
forks the published image per deployment and breaks pull-to-update on the NAS.
→ `src/vite-env.d.ts` (deliberately empty, with a note)

**Rate limit is 30 requests / 60s.** The client queues and backs off on `429` using
`Retry-After`. Don't let requests just fail.
→ `src/lib/habitica/rateLimiter.ts`

**`GET /tasks/user` stops returning a to-do the moment it's completed.** This has caused two
separate bugs. Any feature holding a task *id* loses the ability to name it. Use
`useTaskLookup()`, which merges the `?type=completedTodos` query into one id→Task map.
→ `src/features/tasks/useTasks.ts`

**`GET /tasks/user` has no tag filter parameter and never will.** All tag filtering is
client-side over the already-fetched array. Don't design around a server-side filter.
→ `src/features/tags/tagFilter.ts`

**`PUT` only touches fields you actually send.** Clearing a due date requires sending
`date: null` explicitly — omitting it is a silent no-op. `CreateTaskInput`/`UpdateTaskInput.date`
is typed `string | null` for exactly this.

**Don't replicate Habitica's streak / cron / `nextDue` math client-side.** It's day-start
dependent and getting it subtly wrong is worse than one extra fetch. `useScoreTask` flips
`completed` optimistically, then always invalidates `['tasks']` on settle.
→ `src/features/tasks/taskMutations.ts`

**Dailies read `nextDue[0]`, to-dos read `date`.** Both server-computed. Don't re-derive.
→ `src/features/tasks/taskDueDate.ts`

**`useCreateTask`'s `move/to/0` call must stay in its own `try/catch`.** It runs after the
create to pin new tasks to the top. When it was awaited bare, any transient failure rejected
the whole mutation, so `onSuccess` never ran and a task that genuinely existed server-side
never appeared locally. Reordering is a nice-to-have; the create is not.

**Delete returns `{}`**, unlike every other mutation which returns the updated task. Delete uses
optimistic removal + rollback; everything else adopts the response via `setQueryData`.

**Never fetch `apidoc.habitica.com`** — it's a client-rendered SPA that returns `"Loading..."`
to every non-browser tool. Everything needed is vendored in `docs/`. If something is genuinely
missing, fetch raw source from
`raw.githubusercontent.com/HabitRPG/habitica/develop/website/server/...`.

**If a real API response disagrees with `docs/habitica-api.md`, the doc is wrong** — fix the doc
in the same change. Don't paper over it with a type assertion.

---

## Dates and timezones

> This is the single most expensive bug in the project's history. It was fixed once
> incorrectly, shipped, and had to be fixed again. Full story:
> [`docs/history/2026-08-10-due-dates.md`](history/2026-08-10-due-dates.md).

**`toApiDateTime()` is the only way to write a due date to Habitica.** It exists to give this
rule one obvious home.
→ `src/lib/dateOnly.ts`

**Never send a bare `"YYYY-MM-DD"` string.** Per the ECMAScript spec that parses as **UTC
midnight**, so "due the 18th" is stored as `2026-08-18T00:00:00.000Z` and reads back as the
17th for anyone west of UTC. habitica.com's own frontend sends a real timestamp for *local*
midnight — match that convention, not your own.

**Read a to-do's date with a plain `new Date(task.date)`.** Reading via UTC components was the
*wrong* fix and was reverted — it's right only by coincidence for timezones behind UTC, and
wrong east of it. Once the write side is correct, the plain local read is correct.

**Overdue is a calendar-day comparison, not a timestamp comparison.** Comparing a due-midnight
timestamp against `Date.now()` flags everything due *today* as overdue the instant the clock
passes midnight.
→ `isOverdue` in `src/features/tasks/taskDueDate.ts`

**`dateOnly.ts` is local-calendar; `timeOfDay.ts` is local-only with no API equivalent.**
`toApiDateTime` is the single deliberate exception where this app produces a real UTC instant.

**Test the write→read round-trip across timezones, not a function's internals.** The tests in
`taskDueDate.test.ts` run `toApiDateTime` → `getDueDate` together across five real timezones.
Testing `getDueDate` alone is what let the first, wrong fix look correct.

---

## Persisted stores (zustand)

**A `persist` version bump without a `migrate` function silently DISCARDS the stored state.**
It only `console.error`s — confirmed in `node_modules/zustand/middleware.js`. Ship an explicit
migration on every bump, even an identity one. `settings.trackedTagIds` is unrecoverable if
wiped: the user hand-curated it and nothing else knows what was in it.

**Deletes are tombstones, kept *beside* the records, not as a flag on them.** A flag can be
rendered by accident; a separate list can't. Without tombstones, a device that was offline
during a delete resurrects the record on reconnect.
→ `timelineEntryStore.tombstones`

**A merge timestamp tie resolves to *deleted*.** Recoverable if wrong, unlike a silent
divergence.

**`mergeVersioned<T>` must exist exactly once.** The tie-goes-to-delete rule is the subtlest
code in the app. It was generalised rather than copied for this reason.
→ `src/lib/sync/mergeState.ts`

**The same merge rules run client-side and server-side.** That's what makes a sync safe to
retry, run twice, or interrupt. Changing one without the other breaks that property.
→ `src/lib/sync/mergeState.ts` and `api/src/store.js`

**Open time entries are never synced.** A live clock belongs to the machine that started it.
The pomodoro `run` state isn't synced either, for the same reason.

---

## React / rendering

**`PomodoroPanel` is mounted twice at once on the Timeline page** — once in the rail, once as
the always-rendered dialog Timer tab. StrictMode doubles effects again. Anything that writes
state from an effect in that component fires four times. Logic that must run once lives in the
store or in a single-mounted host.

**No component opens or closes a time entry from a `useEffect`.** The only effect-driven
writers are `PomodoroStatusPill` and the single-mounted `TrackingReconciliationHost`.

**Any surface that renders `task.text` needs BOTH `emojify` and `useTwemoji`.** Two independent
steps: shortcode → real Unicode, then Unicode → a consistently-rendered `<img>`. This has
regressed once already when a new surface was added.
→ `src/lib/emoji.ts`, `src/lib/useTwemoji.ts`

**`<a>` cannot legally nest inside `<button>`.** Markdown notes can contain links, so the notes
preview is a plain `<div>` with its own `onClick`, guarded with `event.target.closest('a')`.
Only the task title is a real `<button>`.

**`ThemeProvider` must always resolve `'system'` to an explicit `.light`/`.dark` class.** Every
Tailwind `dark:` utility compiles against the class-based variant and is blind to a
`prefers-color-scheme` media query. Relying on the media query alone gives correct background
tokens with light-mode text on top — this was the real cause of "markdown text is unreadable",
not a contrast problem.

**Task cards are keyed by `task.id`** so the mount animation plays only for genuinely new tasks,
not for reorders from search or filtering.

---

## Time tracking

The three-records model has its own file — read [`docs/time-tracking.md`](time-tracking.md)
before touching anything in `features/tracking`, `features/timeline` or `features/pomodoro`.
The one-line version: **time is recorded as it happens, never inferred afterwards**, and the
plan (timeline blocks) is never evidence of what was worked on.

---

## Docker / deployment

**`HEALTHCHECK` must target `127.0.0.1`, not `localhost`.** Busybox `wget` resolves `localhost`
to `::1` first, but nginx's plain `listen 80;` only binds the IPv4 wildcard — so every probe
failed with "connection refused" while the app worked fine from outside. The container reported
`unhealthy` forever.

**A bind-mounted volume under `USER node` needs an entrypoint that chowns then drops
privileges.** Docker auto-creates a missing bind-mount path as root, and a build-time `chown` is
invisible because the mount is layered over the image at *run* time. Same class of bug as the
healthcheck one: only a live run finds it.
→ `api/` entrypoint, via `su-exec`

**nginx proxies `/api/` through a *variable* upstream** so the frontend still starts and serves
when the api container is absent. Don't change it to a static upstream — nginx refuses to start
if it can't resolve one at boot.
→ `nginx.conf`

**The Dockerfile build stage is pinned to `--platform=$BUILDPLATFORM`.** Its only output is
static files, which are architecture-independent, so the Node build runs once natively and only
the nginx `COPY` layers are built per architecture.

**The NAS is served over plain HTTP, so every `[SecureContext]` browser API is undefined
there.** `crypto.randomUUID()` is the one that bit: it works on `localhost` and over HTTPS, and
is `undefined` on `http://<nas-ip>:8084`. Calling it threw a `TypeError` *inside the click
handler asking for an id*, so React never re-rendered and the button looked like it did nothing
— which is how "I can't add anything to the timeline" was actually reported. It silently broke
add-to-timeline, start-tracking, pomodoro phase records and saved filter presets, all at once,
while every one of them worked in dev.
**Mint every id through `randomId()` (`src/lib/randomId.ts`), never `crypto.randomUUID()`
directly.** `crypto.getRandomValues()` is *not* secure-context gated, so the fallback is still a
real v4 UUID. oxlint has no `no-restricted-syntax`, so nothing enforces this but this line.
Other secure-context APIs to keep guarded the same way: `Notification` (already is, in
`pomodoroNotify.ts`), `navigator.clipboard`, `crypto.subtle`, service workers.

**The api service trusts `X-Habitica-User-Id` at face value.** It's `expose:`d, not `ports:`ed,
so only the web container can reach it. **Do not port-forward it** — VPN or real auth first.

---

## Charts and category colors

**`--cat-1..8` are positionally assigned** — the Nth tracked tag gets the Nth slot, never
cycled. Past eight: neutral, grouped as "Other" in charts, still listed individually.
→ `src/index.css`, `src/features/pomodoro/pomodoroCategories.ts`

**Don't re-hex or reorder the palette without re-validating against both card surfaces**
(`#ffffff` light / `#16151f` dark). Light mode already warns on contrast for three slots, which
is why every category readout carries a visible name and minute count beside its swatch rather
than relying on color alone. The validator ships with the `dataviz` skill, not this repo.

---

## Verification discipline

**Pure logic takes `now` as a parameter.** Never read the clock inside a function whose
behaviour depends on it — every date boundary has real edge cases (midnight, the 7-day cutoff)
that are only testable if the caller controls "now".
→ `todoBuckets.ts`, `quickAdd.ts`, the tracking modules

**"It looks right in this app" is not verification for anything that round-trips through
Habitica.** This app is a frontend for a real external system with its own conventions. A fix
that is self-consistent within this app's own round-trip can still be wrong — that is exactly
how the timezone bug shipped the first time. Check it on habitica.com.

**Run `npm run typecheck && npm run lint && npm test && npm run build` before claiming
anything is done.** The suite covers frontend and api together and has been the correctness net
for the whole project.

**Say what you did NOT verify.** Every round in `docs/history/` ends with an explicit "not
verified" list. Browser behaviour has never been automated-tested here — no Playwright, no MSW,
and `@testing-library/react` is installed but unused. Don't imply otherwise.
