import { describe, expect, it } from 'vitest'
import { assignLanes } from './timelineLanes'
import type { TimelineEntry } from './timelineEntries'

function e(id: string, startMinutes: number, durationMinutes: number): TimelineEntry {
  return { id, taskId: `task-${id}`, date: '2026-08-25', startMinutes, durationMinutes, createdAt: id }
}

function laneOf(result: ReturnType<typeof assignLanes>, id: string): number {
  const found = result.laned.find((l) => l.entry.id === id)
  if (!found) throw new Error(`entry ${id} missing from result`)
  return found.lane
}

describe('assignLanes', () => {
  it('handles zero and one entries', () => {
    expect(assignLanes([])).toEqual({ laned: [], laneCount: 0 })
    const one = assignLanes([e('a', 540, 30)])
    expect(one.laneCount).toBe(1)
    expect(laneOf(one, 'a')).toBe(0)
  })

  it('puts non-overlapping entries in the same lane', () => {
    const result = assignLanes([e('a', 540, 30), e('b', 600, 30)])
    expect(result.laneCount).toBe(1)
    expect(laneOf(result, 'a')).toBe(0)
    expect(laneOf(result, 'b')).toBe(0)
  })

  it('treats exactly-touching blocks as back-to-back, not overlapping', () => {
    // a ends at 570; b starts at 570 — half-open intervals, one lane.
    const result = assignLanes([e('a', 540, 30), e('b', 570, 30)])
    expect(result.laneCount).toBe(1)
  })

  it('stacks fully overlapping entries into separate lanes', () => {
    const result = assignLanes([e('a', 540, 60), e('b', 550, 60)])
    expect(result.laneCount).toBe(2)
    expect(laneOf(result, 'a')).not.toBe(laneOf(result, 'b'))
  })

  it('needs only 2 lanes for an overlap chain (A↔B, B↔C, A∤C)', () => {
    // a: 540-600, b: 590-650, c: 640-700 — b overlaps both, a and c don't
    // overlap each other, so c reuses a's freed lane.
    const result = assignLanes([e('a', 540, 60), e('b', 590, 60), e('c', 640, 60)])
    expect(result.laneCount).toBe(2)
    expect(laneOf(result, 'c')).toBe(laneOf(result, 'a'))
  })

  it('needs only 2 lanes for one long block over many scattered short ones', () => {
    const long = e('long', 480, 600) // 8:00–18:00
    const shorts = [e('s1', 500, 30), e('s2', 560, 30), e('s3', 620, 30), e('s4', 700, 30), e('s5', 800, 30)]
    const result = assignLanes([long, ...shorts])
    expect(result.laneCount).toBe(2)
    for (const s of shorts) expect(laneOf(result, s.id)).toBe(1)
  })

  it('is deterministic regardless of input array order', () => {
    const entries = [e('a', 540, 60), e('b', 590, 60), e('c', 640, 60), e('d', 540, 30)]
    const forward = assignLanes(entries)
    const reversed = assignLanes([...entries].reverse())
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(laneOf(reversed, id)).toBe(laneOf(forward, id))
    }
    expect(reversed.laneCount).toBe(forward.laneCount)
  })
})
