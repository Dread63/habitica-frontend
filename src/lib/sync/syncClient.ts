import type { PomodoroSettings } from '@/features/pomodoro/pomodoroEngine'
import type { RemoteSession, RemoteSettings, RemoteTimelineEntry } from './mergeState'

/**
 * HTTP client for the focus-sync service.
 *
 * The service is reached at a **same-origin** `/api/…` path, proxied to the
 * api container by the nginx that serves this bundle (see nginx.conf). That's
 * deliberate: same-origin means no CORS preflight on every sync, and no
 * server URL to configure per device — wherever you loaded the app from is
 * where its data lives. It also means "is sync available?" is answered by
 * simply trying, which is what `probeSync` does.
 */

/** Settings payload as stored server-side. Carries the extra display data the
 * server needs for CSV export but has no other way to learn — it never talks
 * to Habitica and has no locale of its own. */
export interface SyncedSettingsPayload extends PomodoroSettings {
  /** tag id -> display name, so exported rows say "Work", not a uuid. */
  tagNames: Record<string, string>
  /** IANA zone of the device that last synced, for local times in the CSV. */
  timeZone: string
}

export interface SyncResponse {
  timelineEntries: RemoteTimelineEntry[]
  sessions: RemoteSession[]
  settings: RemoteSettings<SyncedSettingsPayload> | null
  serverTime: string
}

export interface SyncPushBody {
  timelineEntries: RemoteTimelineEntry[]
  sessions: RemoteSession[]
  settings: RemoteSettings<SyncedSettingsPayload> | null
}

export class SyncUnavailableError extends Error {
  constructor(cause: string) {
    super(`Focus sync service unreachable: ${cause}`)
    this.name = 'SyncUnavailableError'
  }
}

const TIMEOUT_MS = 10_000

async function request(path: string, userId: string, init?: RequestInit): Promise<Response> {
  // An explicit timeout, not just the browser's default: on a LAN a NAS that
  // is powered down often *hangs* rather than refusing, and without this the
  // app would sit "syncing" indefinitely instead of falling back to local.
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: { 'X-Habitica-User-Id': userId, ...init?.headers },
    })
    if (!response.ok) throw new SyncUnavailableError(`HTTP ${response.status}`)
    return response
  } catch (error) {
    if (error instanceof SyncUnavailableError) throw error
    throw new SyncUnavailableError(error instanceof Error ? error.message : 'network error')
  } finally {
    window.clearTimeout(timer)
  }
}

/** Is a sync service deployed alongside this bundle? Used once on startup —
 * running the frontend container alone is a supported setup, and it must not
 * spew failed requests. */
export async function probeSync(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 4000)
    const response = await fetch('/api/health', { signal: controller.signal })
    window.clearTimeout(timer)
    return response.ok
  } catch {
    return false
  }
}

export async function pushAndPull(userId: string, body: SyncPushBody): Promise<SyncResponse> {
  const response = await request('/api/sync', userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await response.json()) as SyncResponse
}

/** Export URLs are plain links, but the user id travels in a header, so the
 * file has to be fetched and turned into a blob rather than linked directly. */
export async function downloadExport(userId: string, format: 'csv' | 'json'): Promise<void> {
  const response = await request(`/api/export.${format}`, userId)
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const suggested = /filename="([^"]+)"/.exec(disposition)?.[1]
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = suggested ?? `focus-export.${format}`
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
