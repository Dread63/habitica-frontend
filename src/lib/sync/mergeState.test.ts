import { describe, expect, it } from 'vitest'
import type { TimelineEntry } from '@/features/timeline/timelineEntries'
import type { PomodoroSessionRecord } from '@/features/pomodoro/pomodoroStats'
import {
  buildPushPayload,
  mergeSessions,
  mergeSettings,
  mergeTimeline,
  type RemoteTimelineEntry,
} from './mergeState'

function entry(id: string, updatedAt: number, overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id,
    taskId: `task-${id}`,
    date: '2026-08-25',
    startMinutes: 540,
    durationMinutes: 30,
    createdAt: `2026-08-25T00:00:0${id.length}.000Z`,
    updatedAt,
    ...overrides,
  }
}

const remote = (id: string, updatedAt: number, payload: TimelineEntry | null): RemoteTimelineEntry => ({
  id,
  updatedAt,
  deleted: payload === null,
  payload,
})

describe('mergeTimeline', () => {
  it('takes a server record this device has never seen', () => {
    const result = mergeTimeline({ entries: [], tombstones: {} }, [remote('e1', 100, entry('e1', 100))])
    expect(result.entries.map((e) => e.id)).toEqual(['e1'])
  })

  it('keeps the newer side when both edited the same placement', () => {
    const local = { entries: [entry('e1', 200, { startMinutes: 600 })], tombstones: {} }
    const result = mergeTimeline(local, [remote('e1', 100, entry('e1', 100, { startMinutes: 540 }))])
    expect(result.entries[0].startMinutes).toBe(600)

    const other = mergeTimeline(local, [remote('e1', 300, entry('e1', 300, { startMinutes: 480 }))])
    expect(other.entries[0].startMinutes).toBe(480)
  })

  it('a server tombstone removes a locally-live entry', () => {
    const local = { entries: [entry('e1', 100)], tombstones: {} }
    const result = mergeTimeline(local, [remote('e1', 200, null)])
    expect(result.entries).toEqual([])
    expect(result.tombstones.e1).toBe(200)
  })

  it('does NOT resurrect an entry this device deleted while the other was offline', () => {
    // The case tombstones exist for: the other device still holds a live copy
    // from before the delete and pushes it back.
    const local = { entries: [], tombstones: { e1: 200 } }
    const result = mergeTimeline(local, [remote('e1', 100, entry('e1', 100))])
    expect(result.entries).toEqual([])
    expect(result.tombstones.e1).toBe(200)
  })

  it('a delete that is newer than a remote edit still wins', () => {
    const local = { entries: [], tombstones: { e1: 300 } }
    const result = mergeTimeline(local, [remote('e1', 250, entry('e1', 250))])
    expect(result.entries).toEqual([])
  })

  it('a remote edit newer than a local delete brings the entry back', () => {
    // Deliberate: someone re-created or re-scheduled it after the deletion.
    const local = { entries: [], tombstones: { e1: 100 } }
    const result = mergeTimeline(local, [remote('e1', 500, entry('e1', 500))])
    expect(result.entries.map((e) => e.id)).toEqual(['e1'])
    expect(result.tombstones.e1).toBeUndefined()
  })

  it('resolves an exact timestamp tie in favour of the deletion', () => {
    const local = { entries: [], tombstones: { e1: 100 } }
    expect(mergeTimeline(local, [remote('e1', 100, entry('e1', 100))]).entries).toEqual([])
  })

  it('leaves local-only entries untouched so the next push carries them up', () => {
    const local = { entries: [entry('mine', 100)], tombstones: {} }
    const result = mergeTimeline(local, [remote('theirs', 100, entry('theirs', 100))])
    expect(result.entries.map((e) => e.id).sort()).toEqual(['mine', 'theirs'])
  })

  it('is idempotent — merging the same response twice changes nothing', () => {
    const local = { entries: [entry('e1', 100)], tombstones: { e2: 50 } }
    const response = [remote('e1', 150, entry('e1', 150)), remote('e2', 50, null)]
    const once = mergeTimeline(local, response)
    expect(mergeTimeline(once, response)).toEqual(once)
  })

  it('stamps the merged entry with the timestamp it was accepted at', () => {
    // Otherwise the next push would advertise a stale updatedAt and the
    // record would ping-pong between devices forever.
    const result = mergeTimeline({ entries: [], tombstones: {} }, [
      remote('e1', 900, entry('e1', 123)),
    ])
    expect(result.entries[0].updatedAt).toBe(900)
  })
})

describe('mergeSessions', () => {
  const session = (id: string, startedAt: string, minutes = 25): PomodoroSessionRecord => ({
    id,
    tasks: [],
    attribution: [],
    startedAt,
    endedAt: startedAt,
    durationMinutes: minutes,
    completedNaturally: true,
  })

  it('unions both sides and orders chronologically', () => {
    const result = mergeSessions(
      [session('local', '2026-08-25T14:00:00.000Z')],
      [{ id: 'remote', startedAt: '2026-08-25T09:00:00.000Z', payload: session('remote', '2026-08-25T09:00:00.000Z') }],
    )
    expect(result.map((s) => s.id)).toEqual(['remote', 'local'])
  })

  it('never rewrites a session that already exists', () => {
    // History is evidence; a later push must not be able to restate it.
    const result = mergeSessions(
      [session('s1', '2026-08-25T09:00:00.000Z', 25)],
      [{ id: 's1', startedAt: '2026-08-25T09:00:00.000Z', payload: session('s1', '2026-08-25T09:00:00.000Z', 999) }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].durationMinutes).toBe(25)
  })

  it('is idempotent', () => {
    const local = [session('a', '2026-08-25T09:00:00.000Z')]
    const incoming = [
      { id: 'b', startedAt: '2026-08-25T10:00:00.000Z', payload: session('b', '2026-08-25T10:00:00.000Z') },
    ]
    const once = mergeSessions(local, incoming)
    expect(mergeSessions(once, incoming)).toEqual(once)
  })
})

describe('mergeSettings', () => {
  it('takes the newer side, and tolerates either being absent', () => {
    expect(mergeSettings({ updatedAt: 1, payload: 'old' }, { updatedAt: 2, payload: 'new' })?.payload).toBe('new')
    expect(mergeSettings({ updatedAt: 3, payload: 'local' }, { updatedAt: 2, payload: 'remote' })?.payload).toBe('local')
    expect(mergeSettings(null, { updatedAt: 1, payload: 'remote' })?.payload).toBe('remote')
    expect(mergeSettings({ updatedAt: 1, payload: 'local' }, null)?.payload).toBe('local')
    expect(mergeSettings(null, null)).toBeNull()
  })
})

describe('buildPushPayload', () => {
  it('sends live entries and tombstones together', () => {
    const payload = buildPushPayload({
      timeline: { entries: [entry('live', 100)], tombstones: { gone: 200 } },
      sessions: [],
      settings: null,
    })
    expect(payload.timelineEntries).toEqual([
      { id: 'live', updatedAt: 100, deleted: false, payload: entry('live', 100) },
      { id: 'gone', updatedAt: 200, deleted: true, payload: null },
    ])
  })

  it('round-trips through mergeTimeline unchanged', () => {
    // A device syncing against a server that already agrees with it must not
    // see its own state come back altered.
    const local = { entries: [entry('e1', 100)], tombstones: { e2: 200 } }
    const pushed = buildPushPayload({ timeline: local, sessions: [], settings: null })
    expect(mergeTimeline(local, pushed.timelineEntries)).toEqual(local)
  })
})
