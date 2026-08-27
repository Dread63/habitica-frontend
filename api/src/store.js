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
 * `(user_id, id)` plus a timestamp. The client can evolve TimelineEntry or
 * PomodoroSessionRecord without a server migration, and the server can't
 * silently corrupt a shape it doesn't understand.
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

  -- The audit trail. Append-only by design: a focus session that happened is
  -- a fact about the past, so there is no UPDATE path here at all (see
  -- insertSession's INSERT OR IGNORE). This is the table the CSV/JSON export
  -- reads, and the reason it can be trusted as a record.
  CREATE TABLE IF NOT EXISTS focus_sessions (
    user_id     TEXT    NOT NULL,
    id          TEXT    NOT NULL,
    started_at  TEXT    NOT NULL,
    payload     TEXT    NOT NULL,
    recorded_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );

  CREATE INDEX IF NOT EXISTS focus_sessions_by_start
    ON focus_sessions (user_id, started_at);

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

/** Append-only: an existing session id is never overwritten. */
export function insertSession(db, userId, session) {
  db.prepare(
    `INSERT OR IGNORE INTO focus_sessions (user_id, id, started_at, payload, recorded_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, session.id, session.startedAt, JSON.stringify(session.payload), Date.now())
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

export function readSessions(db, userId, { from, to } = {}) {
  const clauses = ['user_id = ?']
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
      `SELECT id, started_at, payload FROM focus_sessions
       WHERE ${clauses.join(' AND ')} ORDER BY started_at ASC`,
    )
    .all(...params)
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
    for (const session of body.sessions ?? []) insertSession(db, userId, session)
    if (body.settings) upsertSettings(db, userId, body.settings)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
