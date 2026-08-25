import { beforeEach, describe, expect, it } from 'vitest'
import { useTimelineEntryStore } from './timelineEntryStore'

describe('rescheduleEntry (store)', () => {
  beforeEach(() => useTimelineEntryStore.setState({ entries: [] }))

  const entriesFor = (taskId: string) =>
    useTimelineEntryStore.getState().entries.filter((e) => e.taskId === taskId)

  it('moves a placement to another day instead of duplicating it', () => {
    // The report: opening a block's schedule form, changing the date to
    // tomorrow morning and saving used to leave today's block in place and
    // add a second one tomorrow.
    const store = useTimelineEntryStore.getState()
    store.addEntry('t1', '2026-08-25', 9 * 60, 30)
    const id = entriesFor('t1')[0].id

    store.rescheduleEntry(id, '2026-08-26', 8 * 60, 45)

    const after = entriesFor('t1')
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id, date: '2026-08-26', startMinutes: 480, durationMinutes: 45 })
  })

  it('absorbs a placement already sitting on the target day', () => {
    // One placement per task per date is the invariant entryForTaskOnDate and
    // the unscheduled rail rely on, so moving onto an occupied day replaces
    // rather than stacking two blocks for the same task.
    const store = useTimelineEntryStore.getState()
    store.addEntry('t1', '2026-08-25', 9 * 60, 30)
    store.addEntry('t1', '2026-08-26', 14 * 60, 60)
    const moving = entriesFor('t1').find((e) => e.date === '2026-08-25')!.id

    store.rescheduleEntry(moving, '2026-08-26', 8 * 60, 45)

    const after = entriesFor('t1')
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: moving, date: '2026-08-26', startMinutes: 480 })
  })

  it('leaves other tasks on the target day alone', () => {
    const store = useTimelineEntryStore.getState()
    store.addEntry('t1', '2026-08-25', 9 * 60, 30)
    store.addEntry('t2', '2026-08-26', 9 * 60, 30)
    const id = entriesFor('t1')[0].id

    store.rescheduleEntry(id, '2026-08-26', 10 * 60, 30)

    expect(entriesFor('t2')).toHaveLength(1)
    expect(useTimelineEntryStore.getState().entries).toHaveLength(2)
  })

  it('is a no-op for an unknown id', () => {
    const store = useTimelineEntryStore.getState()
    store.addEntry('t1', '2026-08-25', 9 * 60, 30)
    const before = useTimelineEntryStore.getState().entries
    store.rescheduleEntry('nope', '2026-08-26', 600, 30)
    expect(useTimelineEntryStore.getState().entries).toBe(before)
  })
})
