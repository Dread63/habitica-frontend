/**
 * Export formats for the time ledger.
 *
 * The point of these is evidence: a record you could hand to someone asking
 * how your time was spent, that opens in any spreadsheet and doesn't depend on
 * this app still existing. So the CSV is deliberately *flat and
 * self-describing* — resolved tag names rather than ids, local wall-clock
 * times alongside the ISO instants — rather than a dump of internal shapes.
 *
 * **Each row carries its own start and end.** That is the headline change
 * from the previous exporter, which repeated the *session's* window on every
 * task row: a 25-minute session split across two tasks reported both as
 * running the full 25 minutes. Rows are now real intervals, so the file says
 * what actually happened and `minutes` sums correctly under any pivot.
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
  'source',
  'pomodoro_phase',
  'phase_completed',
  'edited',
  'closed_by',
  'original_start_utc',
  'original_end_utc',
  'started_at_utc',
  'ended_at_utc',
  'entry_id',
  'phase_id',
]

/**
 * One row per recorded interval.
 *
 * `phases` is joined by `phase_id` so a row can say whether the pomodoro it
 * belonged to actually completed — the two records are kept apart everywhere
 * else precisely so they *can* disagree, and the export is where seeing both
 * at once is useful.
 *
 * `tagNames` maps tag id -> display name; ids with no known name fall back to
 * the raw id rather than being dropped, so a row is never silently
 * uncategorised because a tag was renamed away.
 */
export function entriesToCsv(entries, { tagNames = {}, timeZone = 'UTC', phases = [] } = {}) {
  const phaseById = new Map(phases.map((p) => [p.id, p.payload ?? p]))
  const lines = [csvRow(COLUMNS)]

  for (const record of entries) {
    const entry = record.payload ?? record
    // An entry still open at export time is reported as running to now —
    // it is real elapsed time, and omitting it would understate the day.
    const endedAt = entry.endedAt ?? new Date().toISOString()
    const start = localParts(entry.startedAt, timeZone)
    const end = localParts(endedAt, timeZone)
    const ms = Math.max(0, Date.parse(endedAt) - Date.parse(entry.startedAt))
    const phase = entry.phaseId ? phaseById.get(entry.phaseId) : undefined
    const categories = (entry.taskSnapshot?.tagIds ?? []).map((id) => tagNames[id] ?? id).join('; ')

    lines.push(
      csvRow([
        start.date,
        start.weekday,
        start.time,
        end.time,
        (ms / 60_000).toFixed(2),
        entry.taskSnapshot?.text ?? entry.taskId ?? '',
        categories,
        entry.source ?? '',
        phase ? phase.phase : '',
        phase ? (phase.completedNaturally ? 'yes' : 'no') : '',
        entry.audit ? 'yes' : 'no',
        entry.closedBy ?? '',
        entry.audit?.original?.startedAt ?? '',
        entry.audit?.original?.endedAt ?? '',
        entry.startedAt,
        entry.endedAt ?? '',
        record.id ?? entry.id,
        entry.phaseId ?? '',
      ]),
    )
  }

  // Trailing newline: POSIX convention, and some spreadsheet importers drop
  // the final row without it.
  return lines.join('\r\n') + '\r\n'
}

/**
 * Full-fidelity backup: everything the server holds for this user, in the
 * shapes the client understands, so it can be restored as-is. Tombstoned
 * entries are omitted — a restore wants the live ledger, not a graveyard.
 */
export function buildJsonExport({ userId, timelineEntries, timeEntries, phases, settings }) {
  return {
    format: 'habitica-frontend/focus-export',
    // v2: `focusSessions` (attribution-era totals) replaced by `timeEntries`
    // (real intervals) plus `pomodoroPhases`.
    version: 2,
    exportedAt: new Date().toISOString(),
    userId,
    timelineEntries: timelineEntries.filter((e) => !e.deleted).map((e) => e.payload),
    timeEntries: timeEntries.filter((e) => !e.deleted).map((e) => e.payload),
    pomodoroPhases: phases.map((p) => p.payload),
    settings: settings?.payload ?? null,
  }
}
