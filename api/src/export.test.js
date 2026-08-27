// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildJsonExport, sessionsToCsv } from './export.js'

const session = (overrides = {}) => ({
  id: 's1',
  startedAt: '2026-08-25T15:00:00.000Z',
  payload: {
    id: 's1',
    startedAt: '2026-08-25T15:00:00.000Z',
    endedAt: '2026-08-25T15:25:00.000Z',
    durationMinutes: 25,
    completedNaturally: true,
    tasks: [],
    attribution: [{ taskId: 't1', text: 'Write report', tagIds: ['tag-work'], minutes: 25 }],
    ...overrides,
  },
})

/** Parse back with a minimal RFC 4180 reader, so assertions test the file as
 * a consumer would read it rather than as the string we happened to build. */
function parseCsv(text) {
  return text
    .trimEnd()
    .split('\r\n')
    .map((line) => line.slice(1, -1).split('","').map((f) => f.replace(/""/g, '"')))
}

describe('sessionsToCsv', () => {
  const tagNames = { 'tag-work': 'Work', 'tag-school': 'School' }

  it('writes a header plus one row per session', () => {
    const [header, row] = parseCsv(sessionsToCsv([session()], { tagNames, timeZone: 'UTC' }))
    expect(header).toEqual([
      'date', 'weekday', 'start_local', 'end_local', 'minutes', 'task', 'categories',
      'completed_full_session', 'started_at_utc', 'ended_at_utc', 'session_id',
    ])
    expect(row).toEqual([
      '2026-08-25', 'Tuesday', '15:00', '15:25', '25.00', 'Write report', 'Work',
      'yes', '2026-08-25T15:00:00.000Z', '2026-08-25T15:25:00.000Z', 's1',
    ])
  })

  it('emits one row per attributed task so the minutes column sums correctly', () => {
    // The property that makes the file pivot honestly: a 25-minute block split
    // across two tasks is two rows of 10 and 15, not two rows of 25.
    const rows = parseCsv(
      sessionsToCsv(
        [
          session({
            attribution: [
              { taskId: 'a', text: 'School task', tagIds: ['tag-school'], minutes: 10 },
              { taskId: 'b', text: 'Work task', tagIds: ['tag-work'], minutes: 15 },
            ],
          }),
        ],
        { tagNames, timeZone: 'UTC' },
      ),
    ).slice(1)

    expect(rows.map((r) => [r[5], r[6], r[4]])).toEqual([
      ['School task', 'School', '10.00'],
      ['Work task', 'Work', '15.00'],
    ])
    expect(rows.reduce((sum, r) => sum + Number(r[4]), 0)).toBe(25)
  })

  it('resolves tag ids to names and joins multiple categories', () => {
    const [, row] = parseCsv(
      sessionsToCsv(
        [session({ attribution: [{ text: 'Both', tagIds: ['tag-work', 'tag-school'], minutes: 25 }] })],
        { tagNames, timeZone: 'UTC' },
      ),
    )
    expect(row[6]).toBe('Work; School')
  })

  it('falls back to the raw id for an unknown tag rather than dropping it', () => {
    const [, row] = parseCsv(
      sessionsToCsv([session({ attribution: [{ text: 'X', tagIds: ['tag-gone'], minutes: 5 }] })], {
        tagNames,
        timeZone: 'UTC',
      }),
    )
    expect(row[6]).toBe('tag-gone')
  })

  it('quotes fields containing commas, quotes and newlines', () => {
    // The classic silent-corruption case for a file nobody re-reads until
    // they need it.
    const csv = sessionsToCsv(
      [session({ attribution: [{ text: 'Report: costs, "final" draft\nline two', tagIds: [], minutes: 25 }] })],
      { timeZone: 'UTC' },
    )
    expect(csv).toContain('"Report: costs, ""final"" draft\nline two"')
    // The header row is still intact and the embedded newline hasn't created
    // a phantom record.
    expect(csv.split('\r\n')[0]).toContain('"session_id"')
  })

  it('renders local wall-clock times in the requested zone', () => {
    const [, row] = parseCsv(sessionsToCsv([session()], { tagNames, timeZone: 'America/Denver' }))
    expect(row[0]).toBe('2026-08-25')
    expect(row[2]).toBe('09:00') // 15:00 UTC = 09:00 MDT
    expect(row[3]).toBe('09:25')
  })

  it('still logs a session that has no attribution at all', () => {
    const [, row] = parseCsv(
      sessionsToCsv([session({ attribution: [] })], { timeZone: 'UTC' }),
    )
    expect(row[5]).toBe('Uncategorized')
    expect(row[4]).toBe('25.00')
  })

  it('marks a manually stopped session as not a full session', () => {
    const [, row] = parseCsv(
      sessionsToCsv([session({ completedNaturally: false })], { timeZone: 'UTC' }),
    )
    expect(row[7]).toBe('no')
  })

  it('produces a header-only file for no sessions', () => {
    expect(parseCsv(sessionsToCsv([], {}))).toHaveLength(1)
  })
})

describe('buildJsonExport', () => {
  it('carries live entries, all sessions and settings', () => {
    const result = buildJsonExport({
      userId: 'u1',
      timelineEntries: [
        { id: 'e1', deleted: false, payload: { id: 'e1' } },
        { id: 'e2', deleted: true, payload: null },
      ],
      sessions: [session()],
      settings: { updatedAt: 1, payload: { workMinutes: 25 } },
    })
    expect(result.format).toBe('habitica-frontend/focus-export')
    // Tombstones are an internal sync mechanism — a restore wants the live
    // schedule, not a graveyard.
    expect(result.timelineEntries).toEqual([{ id: 'e1' }])
    expect(result.focusSessions).toHaveLength(1)
    expect(result.settings.workMinutes).toBe(25)
  })

  it('handles a user with no settings yet', () => {
    const result = buildJsonExport({ userId: 'u1', timelineEntries: [], sessions: [], settings: null })
    expect(result.settings).toBeNull()
  })
})
