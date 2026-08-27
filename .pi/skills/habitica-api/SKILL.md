---
name: habitica-api
description: Load before writing or changing any code that talks to the Habitica API, or that handles a task's due date, scheduling, or any calendar date. Triggers include - editing src/lib/habitica/*, taskMutations, useTasks, taskDueDate, quickAdd date parsing, DatePicker, todoBuckets; adding an endpoint; anything sending or reading task.date or nextDue; debugging an off-by-one date, a missing task, or a 429.
---

# Habitica API work

**Read `docs/habitica-api.md` § Footguns and `docs/gotchas.md` § Habitica API + § Dates before
editing.** This file is the short list of things that have actually broken.

## The five that bite hardest

1. **Never send a bare `"YYYY-MM-DD"`.** It parses as UTC midnight, so "due the 18th" reads back
   as the 17th anywhere west of UTC. Use `toApiDateTime()` from `src/lib/dateOnly.ts` — it is
   the only sanctioned way to write a due date. Read it back with a plain `new Date(task.date)`.

2. **`GET /tasks/user` stops returning a to-do the moment it's completed.** If you hold a task
   *id* and need its text, use `useTaskLookup()` (merges `?type=completedTodos`), not `useTasks`.

3. **`PUT` only touches the fields you send.** Clearing a due date needs an explicit
   `date: null`. Omitting the field is a silent no-op.

4. **Every request needs the `x-client` header**, derived in `client.ts`. All calls go through
   `src/lib/habitica/client.ts` — never construct a `fetch()` against habitica.com anywhere else.

5. **Rate limit is 30/60s.** The client queues and backs off on `429`. Don't bypass it, and
   don't add retries on top of it.

## Do not re-derive server state

Streak, cron and `nextDue` math is day-start dependent. `useScoreTask` flips `completed`
optimistically then always invalidates `['tasks']`. Dailies read `nextDue[0]`, to-dos read
`date` — both server-computed.

## Verification rule specific to this area

**"It looks right in the app" is not enough.** A fix can be self-consistent within this app's own
write→read round-trip and still be wrong against Habitica's convention — that is exactly how the
timezone bug shipped, passed review, and had to be fixed a second time. Check the result on
habitica.com, and write tests that assert the round-trip across timezones rather than testing one
function's internals.

## Where ground truth lives

- `docs/habitica-api.md` — the curated reference. If a real response disagrees with it, **the
  doc is wrong** — fix the doc in the same change, don't cast the type.
- `docs/api-examples/*.json` — real captured responses.
- `docs/vendor/` — Habitica's own Mongoose schemas and route source.
- **Never fetch `apidoc.habitica.com`** — it returns `"Loading..."` to non-browser tools. If
  something is genuinely missing, fetch
  `raw.githubusercontent.com/HabitRPG/habitica/develop/website/server/...`.
