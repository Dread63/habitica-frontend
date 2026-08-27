import { createServer } from 'node:http'
import {
  applySync,
  openDatabase,
  readPhases,
  readSettings,
  readTimeEntries,
  readTimeEntriesInRange,
  readTimelineEntries,
} from './store.js'
import { buildJsonExport, entriesToCsv } from './export.js'

/**
 * The sync + export service. Plain node:http and node:sqlite — no framework,
 * no dependencies, no build step; the container runs `node src/server.js`
 * against the source directly.
 *
 * **Trust model, stated plainly.** Requests identify a user with the
 * `X-Habitica-User-Id` header and the server takes that at face value: it
 * never sees your Habitica API token, and does not verify the id against
 * habitica.com. That was a deliberate choice (see docs/deploy-synology.md) —
 * it keeps the token in the browser where it started, at the cost of this
 * service being safe only on a trusted network. Anyone who can reach this
 * port and knows a user id can read and write that user's focus data. **Do
 * not expose it to the internet without putting real authentication in
 * front of it.**
 */

const PORT = Number(process.env.PORT ?? 8081)
const DB_FILE = process.env.DATA_FILE ?? '/data/focus.sqlite'
const MAX_BODY_BYTES = 32 * 1024 * 1024

const db = openDatabase(DB_FILE)

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      // Guard before buffering, not after: an unbounded push would otherwise
      // let a single request exhaust the container's memory.
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('Body was not valid JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

/** Full server-side state for a user — what every sync response returns. */
function snapshot(userId) {
  return {
    timelineEntries: readTimelineEntries(db, userId),
    timeEntries: readTimeEntries(db, userId),
    phases: readPhases(db, userId),
    settings: readSettings(db, userId),
    serverTime: new Date().toISOString(),
  }
}

/**
 * Rejects anything that isn't a plausible Habitica user id. This isn't
 * authentication (see the trust model above) — it's keeping junk out of the
 * primary key, since the id becomes a partition of everyone's data.
 */
function userIdOf(req) {
  const raw = req.headers['x-habitica-user-id']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < 8 || trimmed.length > 64) return null
  return /^[A-Za-z0-9-]+$/.test(trimmed) ? trimmed : null
}

function contentDisposition(name) {
  return { 'Content-Disposition': `attachment; filename="${name}"` }
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  if (path === '/api/health') {
    return send(res, 200, { status: 'ok' })
  }

  const userId = userIdOf(req)
  if (!userId) {
    return send(res, 400, { error: 'Missing or malformed X-Habitica-User-Id header.' })
  }

  if (path === '/api/sync' && req.method === 'POST') {
    const body = await readBody(req)
    applySync(db, userId, body)
    return send(res, 200, snapshot(userId))
  }

  if (path === '/api/sync' && req.method === 'GET') {
    return send(res, 200, snapshot(userId))
  }

  if (path === '/api/export.json') {
    const stamp = new Date().toISOString().slice(0, 10)
    return send(
      res,
      200,
      buildJsonExport({
        userId,
        timelineEntries: readTimelineEntries(db, userId),
        timeEntries: readTimeEntries(db, userId),
        phases: readPhases(db, userId),
        settings: readSettings(db, userId),
      }),
      contentDisposition(`focus-backup-${stamp}.json`),
    )
  }

  if (path === '/api/export.csv') {
    const entries = readTimeEntriesInRange(db, userId, {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    })
    // Tag names and the display timezone ride along in the synced settings
    // payload, because only the browser knows them — the server never talks
    // to Habitica and has no locale of its own worth trusting.
    const settings = readSettings(db, userId)
    const csv = entriesToCsv(entries, {
      tagNames: settings?.payload?.tagNames ?? {},
      timeZone: url.searchParams.get('tz') ?? settings?.payload?.timeZone ?? 'UTC',
      phases: readPhases(db, userId),
    })
    const stamp = new Date().toISOString().slice(0, 10)
    return send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      ...contentDisposition(`focus-log-${stamp}.csv`),
    })
  }

  return send(res, 404, { error: `No route for ${req.method} ${path}` })
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    const status = error?.status ?? 500
    if (status >= 500) console.error('[api] request failed:', error)
    send(res, status, { error: error?.message ?? 'Internal error' })
  })
})

server.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}, database at ${DB_FILE}`)
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    // Close the DB explicitly so WAL is checkpointed before the container
    // stops, rather than relying on recovery from a -wal file next boot.
    server.close(() => {
      db.close()
      process.exit(0)
    })
  })
}
