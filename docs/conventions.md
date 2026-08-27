# Conventions

## Code

**Habitica API calls go through `src/lib/habitica/client.ts` only.** Nothing else constructs a
`fetch()` against `habitica.com`. The rate limiter, the `x-client` derivation and the auth
headers all live there; a call made anywhere else bypasses all three.

**`src/lib/habitica/types.ts` mirrors `docs/habitica-api.md` § Data shapes exactly.** If a real
API response disagrees with the doc, **the doc is wrong** — correct it in the same change. Don't
work around it with a type assertion.

**The app-local layer never touches Habitica types.** `features/timeline`, `features/pomodoro`
and `features/tracking` join against live tasks by `taskId` at render time. `types.ts` stays a
strict mirror of the API.

**Path alias `@/*` → `src/*`.**

## Tests

Vitest. **Every piece of pure business logic is unit-tested exhaustively before any UI is built
around it** — the tag filter, the task-value color scale, the quick-add parser, task search
ranking, the rate limiter, bucket math, lane packing, the merge rules. This has been the actual
correctness safety net for the whole project, and it's what makes the codebase safe to hand to a
less capable agent.

**Pure logic takes `now` as a parameter** rather than reading the clock. Date boundaries have
real edge cases that are only testable if the caller controls "now".

**Test the round-trip, not the internals**, for anything that crosses a system boundary. See
`docs/gotchas.md` § Dates for how testing a function in isolation let a wrong fix ship.

**Not built, and don't imply otherwise:** `@testing-library/react` and `jest-dom` are installed
but unused — there are no component-render tests. Playwright + MSW e2e was proposed in the
original plan and never set up; neither is a dependency. **No browser automation has ever been
available in any session that built this project.** Fix this doc or actually build it if the gap
starts to matter; don't leave it silently aspirational.

## Verification

Before claiming anything is done:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

This runs the frontend and `api/` suites together — `npm test` alone already covers both.
(Deliberately not quoting a test count here: it goes stale on the next commit and then
quietly misinforms. `npm test` prints the real number.)

**Then say what you did not verify.** Every round in `docs/history/` ends with an explicit "not
verified" list, and that convention is load-bearing — it's how the Docker healthcheck bug and
the timezone bug were eventually caught rather than being permanently assumed fine.

## Design decisions

**Settle open design questions before implementing, not after.** This is the project's most
expensive repeated lesson: the tag filter was fully built and shipped before a UX flaw forced a
redesign, and the same happened to the focus-attribution model. Since Phase 4 the practice has
been to identify genuine forks and confirm the choice first.

A fork is genuine when different readings lead to materially different work. Choosing a Tailwind
class is not a fork. Choosing whether untracked focus time gets dropped, split, or bucketed as
"Uncategorized" is.

## Writing things down

Three destinations, and picking the right one is what keeps `CLAUDE.md` small:

| It's… | Goes in |
|---|---|
| a rule that must never be violated again | `docs/gotchas.md` |
| a decision with a live alternative | `docs/architecture.md` |
| the story of what was tried and why | `docs/history/YYYY-MM-DD-slug.md` |

**`CLAUDE.md` gets a new line only when something changes that an agent must know within the
first ten seconds of every session.** It's loaded into context on every single run, in every
harness — a paragraph there costs more than a page anywhere else.

When you finish a round of work: write the history file, then ask whether it produced a rule.
If it did, add it to `gotchas.md` too. The archive entry alone is not enough, because nobody
reads the archive by default.
