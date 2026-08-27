import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRACE_MS,
  entriesNeedingReview,
  resolveReconcileChoice,
} from './reconciliation'
import { entryDurationMs, type TimeEntry } from './timeEntries'

const at = (h: number, m = 0) => new Date(2026, 7, 27, h, m, 0, 0)

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    taskId: 't1',
    startedAt: at(13, 12).toISOString(),
    endedAt: null,
    taskSnapshot: { text: 'Write report', type: 'todo', tagIds: [] },
    source: 'pomodoro',
    createdAt: at(13, 12).toISOString(),
    updatedAt: at(13, 12).getTime(),
    ...overrides,
  }
}

describe('entriesNeedingReview', () => {
  it('flags an entry that outran the last heartbeat', () => {
    // Started 13:12, device last awake 14:32, now 17:40 — three hours of
    // unwitnessed time.
    const result = entriesNeedingReview([entry()], at(14, 32).getTime(), at(17, 40))
    expect(result.map((e) => e.id)).toEqual(['e1'])
  })

  it('leaves an entry inside the grace period alone', () => {
    const lastSeen = at(17, 38).getTime()
    expect(entriesNeedingReview([entry()], lastSeen, at(17, 40))).toEqual([])
  })

  it('flags a CLOSED entry too — a phase detected hours late is equally unwitnessed', () => {
    // This is the closed-laptop case: the phase ended at 13:37 by the clock,
    // but the device stopped breathing at 13:20.
    const closed = entry({ endedAt: at(13, 37).toISOString() })
    expect(entriesNeedingReview([closed], at(13, 20).getTime(), at(17, 40))).toHaveLength(1)
  })

  it('never asks twice about the same entry', () => {
    const reviewed = entry({ reviewedAt: at(15).toISOString() })
    expect(entriesNeedingReview([reviewed], at(13, 20).getTime(), at(17, 40))).toEqual([])
  })

  it('ignores an entry whose end was already reconciled', () => {
    const done = entry({ endedAt: at(14).toISOString(), closedBy: 'reconciled' })
    expect(entriesNeedingReview([done], at(13, 20).getTime(), at(17, 40))).toEqual([])
  })

  it('honours a custom grace period', () => {
    const lastSeen = at(17, 30).getTime()
    expect(entriesNeedingReview([entry()], lastSeen, at(17, 40), { graceMs: 30 * 60_000 })).toEqual([])
    expect(entriesNeedingReview([entry()], lastSeen, at(17, 40), { graceMs: 60_000 })).toHaveLength(1)
  })

  it('uses a five-minute default grace', () => {
    expect(DEFAULT_GRACE_MS).toBe(5 * 60_000)
  })
})

describe('resolveReconcileChoice', () => {
  const lastSeen = at(14, 32).getTime()
  const now = at(17, 40)

  it('keepUntilLastSeen closes at the heartbeat — the headline fix', () => {
    // Closing the laptop mid-phase must not silently log a full phase of
    // tracked time.
    const result = resolveReconcileChoice(entry(), { kind: 'keepUntilLastSeen' }, lastSeen, now)
    expect(result).toEqual({ endedAt: at(14, 32).toISOString() })

    const trimmed = { ...entry(), endedAt: at(14, 32).toISOString() }
    expect(entryDurationMs(trimmed, now)).toBe(80 * 60_000) // 13:12 → 14:32
  })

  it('never extends an entry whose end is already before the heartbeat', () => {
    const short = entry({ endedAt: at(13, 30).toISOString() })
    expect(resolveReconcileChoice(short, { kind: 'keepUntilLastSeen' }, lastSeen, now)).toEqual({
      endedAt: at(13, 30).toISOString(),
    })
  })

  it('keepAll closes at now for an open entry', () => {
    expect(resolveReconcileChoice(entry(), { kind: 'keepAll' }, lastSeen, now)).toEqual({
      endedAt: now.toISOString(),
    })
  })

  it('keepMinutes measures forward from the start', () => {
    expect(resolveReconcileChoice(entry(), { kind: 'keepMinutes', minutes: 40 }, lastSeen, now)).toEqual({
      endedAt: at(13, 52).toISOString(),
    })
  })

  it('keepPhase closes at the phase end', () => {
    const phaseEnd = at(13, 37).toISOString()
    expect(resolveReconcileChoice(entry(), { kind: 'keepPhase', endedAt: phaseEnd }, lastSeen, now)).toEqual({
      endedAt: phaseEnd,
    })
  })

  it('discard asks for removal rather than a zero-length interval', () => {
    expect(resolveReconcileChoice(entry(), { kind: 'discard' }, lastSeen, now)).toEqual({ discard: true })
  })
})
