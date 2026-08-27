import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * SQLite persistence for the sync service.
 *
 * `node:sqlite` is deliberate: it's built into Node 24, so this service has
 * **zero runtime dependencies** and no native module to compile. That matters
 * because the image is published for linux/arm64 as well as amd64, and the
 * usual choice (better-sqlite3) has no musl/arm64 prebuild — it would drag a
 * full C toolchain into the build for every architecture.
 *
 * The schema deliberately keeps this service *dumb* about the app's data
 * shapes: every record stores an opaque JSON `payload` and merges on
 * `(user_id, id)` plus a timestamp. The client can evolve TimelineEntry,
 * TimeEntry or PomodoroPhaseRecord without a server migration, and the server
 * can't silently corrupt a shape it doesn't understand. The one exception is
 * `started_at`, denormalised out of the time-entry payload purely so exports
 * can range-scan.
 */

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- Mutable records. Deletes are tombstones (deleted = 1) rather than row
  -- removal: without them, a device that was offline during a delete would
  -- happily resurrect the entry on its next sync.
  CREATE TABLE IF NOT EXISTS timeline_entries (
    user_id     TEXT    NOT NULL,
    id          TEXT    NOT NULL,
    payload     TEXT,
    updated_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  );

  -- RETIRED. Superseded by time_entries + pomodoro_phases below.
  --
  -- Left in place rather than dropped: there is no schema-version column and
  -- no migration mechanism here, only CREATE TABLE IF NOT EXISTS, so a DROP
  -- would be irreversible on a NAS that has been running for a while. Old
  -- rows sit here costing nothing; nothing reads or writes them.
  CREATE TABLE IF NOT EXISTS focus_sessions (
    user_id     TEXT    NOT NULL,
    id          TEXT    NOT NULL,
    started_at  TEXT    NOT NULL,
    payload     TEXT    NOT NULL,
    recorded_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );

  -- The time ledger: what was worked on, when. **Mutable** — entries are
  -- editable, so this uses the same last-write-wins + tombstone shape as
  -- timeline_entries. INSERT OR IGNORE here would silently drop a corrected
  -- end time and leave two devices permanently divergent with no error.
  --
  -- started_at is denormalised out of the payload ONLY so exports can range
  -- scan; the server still never interprets the rest of it.
  CREATE TABLE IF NOT EXISTS time_entries (
    user_id    TEXT    NOT NULL,
    id         TEXT    NOT NULL,
    payload    TEXT,
    started_at TEXT,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  );

  CREATE INDEX IF NOT EXISTS time_entries_by_start
    ON time_entries (user_id, started_at);

  -- What the timer did. Genuinely immutable — nothing in the UI edits a phase
  -- record, and "the clock ran 25 minutes from 09:00" is a fact about a
  -- machine rather than a claim about a person. This is the record that earns
  -- the append-only storage focus_sessions above claimed without deserving.
  CREATE TABLE IF NOT EXISTS pomodoro_phases (
    user_id     TEXT    NOT NULL,
    id          TEXT    NOT NULL,
    started_at  TEXT    NOT NULL,
    payload     TEXT    NOT NULL,
    recorded_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );

  CREATE INDEX IF NOT EXISTS pomodoro_phases_by_start
    ON pomodoro_phases (user_id, started_at);

  CREATE TABLE IF NOT EXISTS settings (
    user_id    TEXT PRIMARY KEY,
    payload    TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  );
`

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(SCHEMA)
  return db
}

/**
 * Last-write-wins on `updated_at`. The `<=` in the WHERE clause is what makes
 * this safe to replay: pushing the same change twice (a retried sync, two
 * tabs) is a no-op rather than a flip-flop, and an older record arriving late
 * from a device that was offline can never clobber a newer one.
 */
export function upsertTimelineEntry(db, userId, entry) {
  db.prepare(
    `INSERT INTO timeline_entries (user_id, id, payload, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, id) DO UPDATE SET
       payload    = excluded.payload,
       updated_at = excluded.updated_at,
       deleted    = excluded.deleted
     WHERE timeline_entries.updated_at <= excluded.updated_at`,
  ).run(
    userId,
    entry.id,
    entry.deleted ? null : JSON.stringify(entry.payload ?? null),
    entry.updatedAt,
    entry.deleted ? 1 : 0,
  )
}

/** Same last-write-wins rule as timeline entries — see upsertTimelineEntry. */
export function upsertTimeEntry(db, userId, entry) {
  db.prepare(
    `INSERT INTO time_entries (user_id, id, payload, started_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, id) DO UPDATE SET
       payload    = excluded.payload,
       started_at = excluded.started_at,
       updated_at = excluded.updated_at,
       deleted    = excluded.deleted
     WHERE time_entries.updated_at <= excluded.updated_at`,
  ).run(
    userId,
    entry.id,
    entry.deleted ? null : JSON.stringify(entry.payload ?? null),
    entry.deleted ? null : (entry.startedAt ?? null),
    entry.updatedAt,
    entry.deleted ? 1 : 0,
  )
}

/** Append-only: an existing phase id is never overwritten. */
export function insertPhase(db, userId, phase) {
  db.prepare(
    `INSERT OR IGNORE INTO pomodoro_phases (user_id, id, started_at, payload, recorded_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, phase.id, phase.startedAt, JSON.stringify(phase.payload), Date.now())
}

export function upsertSettings(db, userId, settings) {
  db.prepare(
    `INSERT INTO settings (user_id, payload, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       payload    = excluded.payload,
       updated_at = excluded.updated_at
     WHERE settings.updated_at <= excluded.updated_at`,
  ).run(userId, JSON.stringify(settings.payload), settings.updatedAt)
}

export function readTimelineEntries(db, userId) {
  return db
    .prepare(`SELECT id, payload, updated_at, deleted FROM timeline_entries WHERE user_id = ?`)
    .all(userId)
    .map((row) => ({
      id: row.id,
      updatedAt: row.updated_at,
      deleted: row.deleted === 1,
      payload: row.payload === null ? null : JSON.parse(row.payload),
    }))
}

/**
 * Every entry for a user, tombstones included — the sync response needs them
 * so a delete propagates to other devices.
 */
export function readTimeEntries(db, userId) {
  return db
    .prepare(`SELECT id, payload, started_at, updated_at, deleted FROM time_entries WHERE user_id = ?`)
    .all(userId)
    .map((row) => ({
      id: row.id,
      updatedAt: row.updated_at,
      deleted: row.deleted === 1,
      startedAt: row.started_at,
      payload: row.payload === null ? null : JSON.parse(row.payload),
    }))
}

/**
 * Live entries in a date range, for export. Tombstones are excluded here
 * (their started_at is null), unlike the sync read above.
 */
export function readTimeEntriesInRange(db, userId, { from, to } = {}) {
  const clauses = ['user_id = ?', 'deleted = 0', 'started_at IS NOT NULL']
  const params = [userId]
  if (from) {
    clauses.push('started_at >= ?')
    params.push(from)
  }
  if (to) {
    clauses.push('started_at <= ?')
    params.push(to)
  }
  return db
    .prepare(
      `SELECT id, started_at, payload FROM time_entries
       WHERE ${clauses.join(' AND ')} ORDER BY started_at ASC`,
    )
    .all(...params)
    .map((row) => ({ id: row.id, startedAt: row.started_at, payload: JSON.parse(row.payload) }))
}

export function readPhases(db, userId) {
  return db
    .prepare(
      `SELECT id, started_at, payload FROM pomodoro_phases
       WHERE user_id = ? ORDER BY started_at ASC`,
    )
    .all(userId)
    .map((row) => ({ id: row.id, startedAt: row.started_at, payload: JSON.parse(row.payload) }))
}

export function readSettings(db, userId) {
  const row = db.prepare(`SELECT payload, updated_at FROM settings WHERE user_id = ?`).get(userId)
  return row ? { updatedAt: row.updated_at, payload: JSON.parse(row.payload) } : null
}

/**
 * Applies a whole client push in one transaction, so a sync that fails
 * halfway can't leave the server holding half a device's state.
 */
export function applySync(db, userId, body) {
  db.exec('BEGIN')
  try {
    for (const entry of body.timelineEntries ?? []) upsertTimelineEntry(db, userId, entry)
    for (const entry of body.timeEntries ?? []) upsertTimeEntry(db, userId, entry)
    for (const phase of body.phases ?? []) insertPhase(db, userId, phase)
    // A `sessions` key from a stale cached bundle is ignored rather than
    // erroring — that's what keeps a rolling deploy (api updated before the
    // browser reloads) from throwing 500s at the old client.
    if (body.settings) upsertSettings(db, userId, body.settings)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
