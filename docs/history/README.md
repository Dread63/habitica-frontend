# Engineering history

Chronological archive of every build round, split out of `CLAUDE.md` on 2026-08-27 when that
file had grown to 96KB (~24k tokens) — too large to load into an agent's context every session.

**You almost certainly do not need to read these.** They are archaeology: why a decision was
made, what was tried first, what broke. The rules that are still load-bearing were extracted
into `docs/gotchas.md`, `docs/architecture.md` and `docs/time-tracking.md`. Read those instead.

Come here when you need to know **why** something is the way it is, and the short version in
the extracted docs isn't enough.

| Date | Round | Read it for |
|---|---|---|
| ≤2026-08-10 | [Phases 0–4 + design pass](2026-08-phases-0-4.md) | How the app was built; the tag-filter redesign; Twemoji/CDN rationale |
| 2026-08-10 | [Real-usage feedback](2026-08-10-real-usage-feedback.md) | The rail layout; the `.dark` class theming bug; why `window.confirm` is gone |
| 2026-08-10 | [Wide layout](2026-08-10-wide-layout.md) | `TodoBoard`'s buckets; why multicol not grid |
| 2026-08-10 | [Due dates](2026-08-10-due-dates.md) | **The timezone bug, fixed wrong then fixed right.** The single best thing in this archive |
| 2026-08-10 | [Docker verified](2026-08-10-docker-verified.md) | The `localhost`/`::1` healthcheck bug |
| 2026-08-25 | [Timeline + Pomodoro](2026-08-25-timeline-pomodoro.md) ⚠️ | Lane packing; timestamp-anchor clock. *Partly superseded* |
| 2026-08-25 | [Timeline + Pomodoro revision](2026-08-25-timeline-pomodoro-revision.md) ⚠️ | The zustand `migrate` trap; category colors. *Attribution content is dead* |
| 2026-08-26 | [Publishing + Synology](2026-08-26-publishing-synology.md) | Why the app has zero build-time config; GHCR tags |
| 2026-08-27 | [NAS sync + export](2026-08-27-nas-sync-export.md) ⚠️ | Tombstones; merge rules; the bind-mount `chown` bug. *Partly superseded* |
| 2026-08-27 | [Time-tracking rebuild](2026-08-27-time-tracking-rebuild.md) | **The current model.** Why attribution was deleted |

⚠️ = carries a superseded-content warning at the top. Read the warning before trusting the file.

## The trap in reading this archive

These files are in chronological order, and **later rounds contradict earlier ones**. The
2026-08-25 rounds describe a focus-*attribution* system in loving detail; the 2026-08-27 rebuild
deleted it entirely. Anyone reading top-down and stopping early will implement something that
was removed on purpose.

This is exactly why the archive is out of the always-loaded brief. When history and
`docs/gotchas.md` disagree, **gotchas.md wins** — and if you find a case where it does, fix
gotchas.md in the same change.

## Adding a new round

Append a file named `YYYY-MM-DD-short-slug.md` and a row to the table above. Then ask the real
question: **did this round produce a rule that must never be violated again?** If so it belongs
in `docs/gotchas.md` as well — the archive entry is not enough, because nobody reads the archive
by default. That split is the entire point of this structure.
