import * as React from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useTags } from '@/features/tasks/useTags'
import { useTimelineEntryStore } from '@/features/timeline/timelineEntryStore'
import { usePomodoroStore } from '@/features/pomodoro/pomodoroStore'
import { useTimeEntryStore } from '@/features/tracking/timeEntryStore'
import { buildPushPayload, mergePhases, mergeSettings, mergeTimeEntries, mergeTimeline } from './mergeState'
import { pushAndPull, probeSync, type SyncedSettingsPayload } from './syncClient'
import { useFocusSyncStore } from './focusSyncStore'

/** How often to sync when nothing has changed — catches edits made on another
 * device. Short enough to feel live on a LAN, long enough to be invisible. */
const POLL_MS = 60_000
/** Delay after a local change before pushing, so a drag that fires twenty
 * store writes results in one request rather than twenty. */
const DEBOUNCE_MS = 2_000

/**
 * Mirrors timeline placements and focus history to the NAS.
 *
 * **localStorage stays the working copy.** Every read in the app still comes
 * from the zustand stores, so the UI is identical whether the server is
 * reachable, slow, or absent entirely — running the frontend container on its
 * own remains a supported setup. This hook only pushes local state up, merges
 * what comes back, and reports status.
 *
 * The push is the device's *whole* state rather than a delta. For one
 * person's data (a few thousand records) that is a small request, and it
 * makes the protocol inherently self-healing: any sync that succeeds
 * reconciles everything, so a missed push, a failed request, or a device that
 * was off for a month all recover on the next successful call with no queue
 * to replay or corrupt. Revisit if the payload ever gets big enough to
 * notice — a `since` parameter would be the change.
 */
export function useFocusSync(): void {
  const { isAuthenticated, credentials } = useAuth()
  const tagsQuery = useTags()
  const pendingRevision = useFocusSyncStore((s) => s.pendingRevision)
  const { setStatus, markSynced } = useFocusSyncStore()

  const userId = credentials?.userId ?? null
  const [available, setAvailable] = React.useState<boolean | null>(null)

  // Tag names ride along with settings so the server can resolve them in the
  // CSV export; it has no other way to learn them.
  const tagNames = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const tag of tagsQuery.data ?? []) map[tag.id] = tag.name
    return map
  }, [tagsQuery.data])
  const tagNamesRef = React.useRef(tagNames)
  tagNamesRef.current = tagNames

  React.useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    void probeSync().then((ok) => {
      if (cancelled) return
      setAvailable(ok)
      if (!ok) setStatus('unavailable')
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, setStatus])

  // True while a sync response is being written into the stores. Without it,
  // applying the merge would notify the subscriptions below, which would mark
  // the state as changed, which would schedule another sync — a loop that
  // never settles.
  const applyingRef = React.useRef(false)

  React.useEffect(() => {
    if (!isAuthenticated) return
    const { markChanged } = useFocusSyncStore.getState()
    // Compare the specific slices that sync, by reference. Subscribing to the
    // whole store would fire on every pomodoro clock tick and every UI-only
    // field, pushing constantly for no reason.
    let timeline = useTimelineEntryStore.getState()
    let pomodoro = usePomodoroStore.getState()
    let ledger = useTimeEntryStore.getState()

    const unsubscribeTimeline = useTimelineEntryStore.subscribe((state) => {
      const changed = state.entries !== timeline.entries || state.tombstones !== timeline.tombstones
      timeline = state
      if (changed && !applyingRef.current) markChanged()
    })
    const unsubscribePomodoro = usePomodoroStore.subscribe((state) => {
      const changed =
        state.phases !== pomodoro.phases || state.settingsUpdatedAt !== pomodoro.settingsUpdatedAt
      pomodoro = state
      if (changed && !applyingRef.current) markChanged()
    })
    // Forgetting this one is the silent failure mode of the whole sync layer:
    // edits would simply never leave the device and nothing, anywhere, errors.
    const unsubscribeLedger = useTimeEntryStore.subscribe((state) => {
      const changed = state.entries !== ledger.entries || state.tombstones !== ledger.tombstones
      ledger = state
      if (changed && !applyingRef.current) markChanged()
    })
    return () => {
      unsubscribeTimeline()
      unsubscribePomodoro()
      unsubscribeLedger()
    }
  }, [isAuthenticated])

  const runSync = React.useCallback(async () => {
    if (!userId) return
    setStatus('syncing')
    try {
      const timeline = useTimelineEntryStore.getState()
      const pomodoro = usePomodoroStore.getState()
      const ledger = useTimeEntryStore.getState()

      const settingsPayload: SyncedSettingsPayload = {
        ...pomodoro.settings,
        tagNames: tagNamesRef.current,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }

      const response = await pushAndPull(
        userId,
        buildPushPayload({
          timeline: { entries: timeline.entries, tombstones: timeline.tombstones },
          timeEntries: { entries: ledger.entries, tombstones: ledger.tombstones },
          phases: pomodoro.phases,
          settings: { updatedAt: pomodoro.settingsUpdatedAt, payload: settingsPayload },
        }),
      )

      // Re-read state rather than reusing the snapshot above: an edit made
      // while the request was in flight must not be clobbered by the response
      // it wasn't part of. mergeTimeline applies the same last-write-wins
      // rule the server does, so the newer side survives either way.
      //
      // The `?? []` on each field is a version-skew guard, not defensive
      // noise: a server still speaking the pre-ledger shape omits
      // `timeEntries`/`phases` entirely, and iterating undefined would throw
      // inside the merge and surface as a permanent, misleading "Offline".
      // Treating a missing collection as empty means an older server costs
      // you sync of that record type, not the whole app.
      applyingRef.current = true
      const freshTimeline = useTimelineEntryStore.getState()
      useTimelineEntryStore
        .getState()
        .applySyncedState(
          mergeTimeline(
            { entries: freshTimeline.entries, tombstones: freshTimeline.tombstones },
            response.timelineEntries ?? [],
          ),
        )

      const freshLedger = useTimeEntryStore.getState()
      freshLedger.applySyncedState(
        mergeTimeEntries(
          { entries: freshLedger.entries, tombstones: freshLedger.tombstones },
          response.timeEntries ?? [],
        ),
      )

      const freshPomodoro = usePomodoroStore.getState()
      const mergedSettings = mergeSettings(
        { updatedAt: freshPomodoro.settingsUpdatedAt, payload: settingsPayload },
        response.settings,
      )
      freshPomodoro.applySyncedState({
        phases: mergePhases(freshPomodoro.phases, response.phases ?? []),
        // Strip the transport-only fields back off before they reach the
        // pomodoro settings shape, which knows nothing about tag names.
        settings: mergedSettings
          ? (({ tagNames: _t, timeZone: _z, ...rest }) => rest)(mergedSettings.payload)
          : freshPomodoro.settings,
        settingsUpdatedAt: mergedSettings?.updatedAt ?? freshPomodoro.settingsUpdatedAt,
      })

      markSynced()
    } catch (error) {
      // Offline is an expected state, not a failure to shout about — the app
      // carries on against localStorage and retries on the next tick.
      setStatus('offline', error instanceof Error ? error.message : String(error))
    } finally {
      applyingRef.current = false
    }
  }, [userId, setStatus, markSynced])

  // Debounced push on local change, plus a slow poll to pick up other devices.
  React.useEffect(() => {
    if (!isAuthenticated || available !== true || !userId) return
    const timer = window.setTimeout(() => void runSync(), pendingRevision === 0 ? 0 : DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [isAuthenticated, available, userId, pendingRevision, runSync])

  React.useEffect(() => {
    if (!isAuthenticated || available !== true) return
    const id = window.setInterval(() => void runSync(), POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void runSync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [isAuthenticated, available, runSync])
}
