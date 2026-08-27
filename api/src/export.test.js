// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildJsonExport, entriesToCsv } from './export.js'

const entry = (overrides = {}) => ({
  id: 'e1',
  startedAt: '2026-08-27T15:00:00.000Z',
  payload: {
    id: 'e1',
    taskId: 't1',
    startedAt: '2026-08-27T15:00:00.000Z',
    endedAt: '2026-08-27T15:10:00.000Z',
    taskSnapshot: { text: 'Write report', type: 'todo', tagIds: ['tag-work'] },
    source: 'pomodoro',
    closedBy: 'switch',
    ...overrides,
  },
})

/** Parse back with a minimal RFC 4180 reader, so assertions test the file as a
 * consumer would read it rather than as the string we happened to build. */
function parseCsv(text) {
  return text
    .trimEnd()
    .split('\r\n')
    .map((line) => line.slice(1, -1).split('","').map((f) => f.replace(/""/g, '"')))
}

const col = (header, row, name) => row[header.indexOf(name)]

describe('entriesToCsv', () => {
  const tagNames = { 'tag-work': 'Work', 'tag-school': 'School' }

  it('writes a header plus one row per interval', () => {
    const [header, row] = parseCsv(entriesToCsv([entry()], { tagNames, timeZone: 'UTC' }))
    expect(header).toContain('entry_id')
    expect(col(header, row, 'date')).toBe('2026-08-27')
    expect(col(header, row, 'weekday')).toBe('Thursday')
    expect(col(header, row, 'start_local')).toBe('15:00')
    expect(col(header, row, 'end_local')).toBe('15:10')
    expect(col(header, row, 'minutes')).toBe('10.00')
    expect(col(header, row, 'task')).toBe('Write report')
    expect(col(header, row, 'categories')).toBe('Work')
    expect(col(header, row, 'source')).toBe('pomodoro')
  })

  it('each row carries its OWN start and end, not a shared session window', () => {
    // The headline fix. The previous exporter repeated the session's window on
    // every task row, so a 25-minute session split across two tasks reported
    // both as running the full 25 minutes.
    const rows = parseCsv(
      entriesToCsv(
        [
          entry({ endedAt: '2026-08-27T15:10:00.000Z' }),
          {
            id: 'e2',
            startedAt: '2026-08-27T15:10:00.000Z',
            payload: {
              id: 'e2',
              startedAt: '2026-08-27T15:10:00.000Z',
              endedAt: '2026-08-27T15:25:00.000Z',
              taskSnapshot: { text: 'Fix bug', type: 'todo', tagIds: ['tag-school'] },
              source: 'pomodoro',
            },
          },
        ],
        { tagNames, timeZone: 'UTC' },
      ),
    )
    const [header, ...data] = rows
    expect(data.map((r) => [col(header, r, 'start_local'), col(header, r, 'end_local'), col(header, r, 'minutes')])).toEqual([
      ['15:00', '15:10', '10.00'],
      ['15:10', '15:25', '15.00'],
    ])
  })

  it('minutes sum to the real elapsed total', () => {
    const rows = parseCsv(
      entriesToCsv(
        [
          entry({ endedAt: '2026-08-27T15:10:00.000Z' }),
          { id: 'e2', startedAt: '2026-08-27T15:10:00.000Z', payload: { id: 'e2', startedAt: '2026-08-27T15:10:00.000Z', endedAt: '2026-08-27T15:25:00.000Z', taskSnapshot: { text: 'B', type: 'todo', tagIds: [] } } },
        ],
        { timeZone: 'UTC' },
      ),
    )
    const [header, ...data] = rows
    expect(data.reduce((sum, r) => sum + Number(col(header, r, 'minutes')), 0)).toBe(25)
  })

  it('joins the pomodoro phase so a row can say whether the timer completed', () => {
    const [header, row] = parseCsv(
      entriesToCsv([entry({ phaseId: 'p1' })], {
        tagNames,
        timeZone: 'UTC',
        phases: [{ id: 'p1', payload: { id: 'p1', phase: 'work', completedNaturally: true } }],
      }),
    )
    expect(col(header, row, 'pomodoro_phase')).toBe('work')
    expect(col(header, row, 'phase_completed')).toBe('yes')
  })

  it('reports an edited entry alongside its original values', () => {
    const [header, row] = parseCsv(
      entriesToCsv(
        [
          entry({
            endedAt: '2026-08-27T15:40:00.000Z',
            audit: {
              original: { taskId: 't1', startedAt: '2026-08-27T15:00:00.000Z', endedAt: '2026-08-27T15:10:00.000Z' },
              editedAt: '2026-08-27T16:00:00.000Z',
              editCount: 1,
            },
          }),
        ],
        { timeZone: 'UTC' },
      ),
    )
    expect(col(header, row, 'edited')).toBe('yes')
    expect(col(header, row, 'original_end_utc')).toBe('2026-08-27T15:10:00.000Z')
    expect(col(header, row, 'ended_at_utc')).toBe('2026-08-27T15:40:00.000Z')
  })

  it('marks an end that was reconstructed rather than observed', () => {
    const [header, row] = parseCsv(
      entriesToCsv([entry({ closedBy: 'reconciled' })], { timeZone: 'UTC' }),
    )
    expect(col(header, row, 'closed_by')).toBe('reconciled')
  })

  it('resolves tag ids to names, falling back to the raw id rather than dropping it', () => {
    const [header, row] = parseCsv(
      entriesToCsv(
        [entry({ taskSnapshot: { text: 'X', type: 'todo', tagIds: ['tag-work', 'tag-gone'] } })],
        { tagNames, timeZone: 'UTC' },
      ),
    )
    expect(col(header, row, 'categories')).toBe('Work; tag-gone')
  })

  it('quotes fields containing commas, quotes and newlines', () => {
    const csv = entriesToCsv(
      [entry({ taskSnapshot: { text: 'Report: costs, "final" draft\nline two', type: 'todo', tagIds: [] } })],
      { timeZone: 'UTC' },
    )
    expect(csv).toContain('"Report: costs, ""final"" draft\nline two"')
    expect(csv.split('\r\n')[0]).toContain('"entry_id"')
  })

  it('renders local wall-clock times in the requested zone', () => {
    const [header, row] = parseCsv(entriesToCsv([entry()], { timeZone: 'America/Denver' }))
    expect(col(header, row, 'start_local')).toBe('09:00') // 15:00 UTC = 09:00 MDT
  })

  it('includes an entry still open at export time, measured to now', () => {
    const rows = parseCsv(entriesToCsv([entry({ endedAt: null })], { timeZone: 'UTC' }))
    expect(rows).toHaveLength(2)
    expect(col(rows[0], rows[1], 'ended_at_utc')).toBe('')
    expect(Number(col(rows[0], rows[1], 'minutes'))).toBeGreaterThan(0)
  })

  it('produces a header-only file for no entries', () => {
    expect(parseCsv(entriesToCsv([], {}))).toHaveLength(1)
  })
})

describe('buildJsonExport', () => {
  it('carries live placements, live entries, phases and settings', () => {
    const result = buildJsonExport({
      userId: 'u1',
      timelineEntries: [
        { id: 'p1', deleted: false, payload: { id: 'p1' } },
        { id: 'p2', deleted: true, payload: null },
      ],
      timeEntries: [
        { id: 'e1', deleted: false, payload: { id: 'e1' } },
        { id: 'e2', deleted: true, payload: null },
      ],
      phases: [{ id: 'ph1', payload: { id: 'ph1' } }],
      settings: { updatedAt: 1, payload: { workMinutes: 25 } },
    })
    expect(result.format).toBe('habitica-frontend/focus-export')
    expect(result.version).toBe(2)
    // Tombstones are an internal sync mechanism — a restore wants the live
    // ledger, not a graveyard.
    expect(result.timelineEntries).toEqual([{ id: 'p1' }])
    expect(result.timeEntries).toEqual([{ id: 'e1' }])
    expect(result.pomodoroPhases).toEqual([{ id: 'ph1' }])
    expect(result.settings.workMinutes).toBe(25)
  })

  it('handles a user with no settings yet', () => {
    const result = buildJsonExport({
      userId: 'u1',
      timelineEntries: [],
      timeEntries: [],
      phases: [],
      settings: null,
    })
    expect(result.settings).toBeNull()
  })
})
