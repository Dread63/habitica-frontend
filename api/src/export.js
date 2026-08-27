/**
 * Export formats for the focus log.
 *
 * The point of these is evidence: a record you could hand to someone asking
 * how your time was spent, that opens in any spreadsheet and doesn't depend
 * on this app still existing. So the CSV is deliberately *flat and
 * self-describing* — resolved tag names rather than ids, local wall-clock
 * times alongside the ISO instants, one row per task per session — rather
 * than a dump of the internal shapes.
 */

/**
 * RFC 4180 quoting. Every field is quoted unconditionally: it costs a few
 * bytes and removes the entire class of "a task title contained a comma"
 * bugs, which is exactly the kind of thing that silently corrupts a CSV
 * nobody re-reads until they need it.
 */
function csvField(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function csvRow(fields) {
  return fields.map(csvField).join(',')
}

/** Local-time "YYYY-MM-DD HH:mm" for a spreadsheet, in the given IANA zone. */
function localParts(iso, timeZone) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { date: '', time: '', weekday: '' }
  const fmt = (options) => new Intl.DateTimeFormat('en-CA', { timeZone, ...options }).format(date)
  return {
    date: fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }),
    time: fmt({ hour: '2-digit', minute: '2-digit', hour12: false }),
    weekday: fmt({ weekday: 'long' }),
  }
}

const COLUMNS = [
  'date',
  'weekday',
  'start_local',
  'end_local',
  'minutes',
  'task',
  'categories',
  'completed_full_session',
  'started_at_utc',
  'ended_at_utc',
  'session_id',
]

/**
 * One row per *attributed task*, not per session — a 25-minute block split
 * across two tasks becomes two rows whose minutes sum to the block. That's
 * what makes the file pivot correctly: summing `minutes` by `categories` or
 * by `task` gives real totals instead of double-counting the session length.
 *
 * `tagNames` maps tag id -> display name; ids with no known name fall back to
 * the raw id rather than being dropped, so a row is never silently
 * uncategorised because a tag was renamed away.
 */
export function sessionsToCsv(sessions, { tagNames = {}, timeZone = 'UTC' } = {}) {
  const lines = [csvRow(COLUMNS)]

  for (const session of sessions) {
    const record = session.payload ?? {}
    const start = localParts(record.startedAt ?? session.startedAt, timeZone)
    const end = localParts(record.endedAt ?? session.startedAt, timeZone)
    const attribution = Array.isArray(record.attribution) ? record.attribution : []

    // A session with no attribution still belongs in the log — it's real
    // elapsed time. It just reports as a single uncategorised row.
    const rows = attribution.length > 0 ? attribution : [{ text: 'Uncategorized', tagIds: [], minutes: record.durationMinutes }]

    for (const item of rows) {
      const categories = (item.tagIds ?? []).map((id) => tagNames[id] ?? id).join('; ')
      lines.push(
        csvRow([
          start.date,
          start.weekday,
          start.time,
          end.time,
          typeof item.minutes === 'number' ? item.minutes.toFixed(2) : '',
          item.text ?? '',
          categories,
          record.completedNaturally ? 'yes' : 'no',
          record.startedAt ?? session.startedAt,
          record.endedAt ?? '',
          session.id,
        ]),
      )
    }
  }

  // Trailing newline: POSIX text-file convention, and some spreadsheet
  // importers drop the final row without it.
  return lines.join('\r\n') + '\r\n'
}

/**
 * Full-fidelity backup: everything the server holds for this user, in the
 * shapes the client understands, so it can be restored as-is. Tombstoned
 * timeline entries are omitted — a restore wants the live schedule, not a
 * graveyard.
 */
export function buildJsonExport({ userId, timelineEntries, sessions, settings }) {
  return {
    format: 'habitica-frontend/focus-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    userId,
    timelineEntries: timelineEntries.filter((e) => !e.deleted).map((e) => e.payload),
    focusSessions: sessions.map((s) => s.payload),
    settings: settings?.payload ?? null,
  }
}
