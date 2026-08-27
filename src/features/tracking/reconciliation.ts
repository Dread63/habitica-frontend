import { entryEndMs, type TimeEntry } from './timeEntries'

/**
 * Catching time the app recorded but nobody witnessed.
 *
 * The failure this exists for: close the laptop ten minutes into a focus
 * phase, come back tomorrow, and the old model logged a full completed
 * session as real focus. The clock has no idea you left.
 *
 * A bare "this has been running three hours, are you sure?" would make the
 * user reconstruct a time from memory. A **heartbeat** lets the app propose
 * the right answer instead: a timestamp written every so often while the tab
 * is alive. Lid-close, browser quit and machine sleep all stop it; a
 * backgrounded tab while you genuinely work does not — which is exactly the
 * signal wanted, and the reason the heartbeat must NOT be gated on
 * `visibilitychange` (that version would prompt every time you switched tabs).
 */

/** Written every interval by TrackingReconciliationHost. Browser throttling of
 * background timers to roughly 1/min is fine — we only need the order of
 * magnitude. */
export const HEARTBEAT_INTERVAL_MS = 30_000

/** How far an interval may outrun the last heartbeat before it's suspicious.
 * Generous: normal detection latency is a second to a minute. */
export const DEFAULT_GRACE_MS = 5 * 60_000

/**
 * Entries whose recorded time extends meaningfully past the last moment this
 * device was known to be awake.
 *
 * Deliberately covers **closed** entries too, not just open ones: a phase
 * whose completion was detected five hours late closes its entry at the
 * phase-end instant, which is equally unwitnessed. One rule, both cases.
 */
export function entriesNeedingReview(
  entries: TimeEntry[],
  lastSeenAt: number,
  now: Date,
  options: { graceMs?: number } = {},
): TimeEntry[] {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS
  return entries.filter((entry) => {
    if (entry.reviewedAt !== undefined) return false
    // Already reconciled once — re-offering would be an infinite loop.
    if (entry.closedBy === 'reconciled') return false
    // Only time recorded *after* the device went quiet is in question.
    if (Date.parse(entry.startedAt) > entryEndMs(entry, now)) return false
    return entryEndMs(entry, now) - lastSeenAt > graceMs
  })
}

export type ReconcileChoice =
  | { kind: 'keepUntilLastSeen' }
  | { kind: 'keepAll' }
  | { kind: 'keepMinutes'; minutes: number }
  | { kind: 'keepPhase'; endedAt: string }
  | { kind: 'discard' }

/**
 * The end instant a choice implies, or null to delete the entry outright.
 * Pure so the arithmetic — which is the part that's easy to get subtly wrong
 * — is testable without a dialog.
 */
export function resolveReconcileChoice(
  entry: TimeEntry,
  choice: ReconcileChoice,
  lastSeenAt: number,
  now: Date,
): { endedAt: string } | { discard: true } {
  switch (choice.kind) {
    case 'discard':
      return { discard: true }
    case 'keepAll':
      return { endedAt: new Date(entryEndMs(entry, now)).toISOString() }
    case 'keepPhase':
      return { endedAt: choice.endedAt }
    case 'keepMinutes':
      return {
        endedAt: new Date(Date.parse(entry.startedAt) + choice.minutes * 60_000).toISOString(),
      }
    case 'keepUntilLastSeen':
    default:
      // Never *extend* an entry: if the heartbeat is somehow newer than the
      // entry's own end, keeping its end is the honest answer.
      return { endedAt: new Date(Math.min(lastSeenAt, entryEndMs(entry, now))).toISOString() }
  }
}
