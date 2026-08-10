import { RateLimiter } from './rateLimiter'
import { getStoredCredentials, type HabiticaCredentials } from './auth'
import type { HabiticaEnvelope, HabiticaErrorBody, HabiticaUser } from './types'

const BASE_URL = 'https://habitica.com/api/v3'
const MAX_429_RETRIES = 3

const CLIENT_ID = import.meta.env.VITE_HABITICA_CLIENT_ID

const limiter = new RateLimiter()

export class HabiticaApiError extends Error {
  readonly status: number
  readonly body: HabiticaErrorBody | undefined

  constructor(status: number, body: HabiticaErrorBody | undefined, message: string) {
    super(message)
    this.name = 'HabiticaApiError'
    this.status = status
    this.body = body
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** Used only by the login screen, to validate credentials before storing them. */
  credentialsOverride?: HabiticaCredentials
  /** Internal — counts 429 retries so a misbehaving server can't loop forever. */
  retryCount?: number
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const credentials = options.credentialsOverride ?? getStoredCredentials()
  if (!credentials) {
    throw new HabiticaApiError(401, undefined, 'No Habitica credentials stored — log in first.')
  }
  if (!CLIENT_ID) {
    // Fail loudly at request time rather than silently sending a request
    // Habitica will reject anyway — see docs/habitica-api.md § Footguns.
    throw new Error(
      'VITE_HABITICA_CLIENT_ID is not set. Copy .env.example to .env and set it — Habitica ' +
        'rejects every request that lacks a valid x-client header.',
    )
  }

  await limiter.acquire()

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-user': credentials.userId,
      'x-api-key': credentials.apiToken,
      'x-client': CLIENT_ID,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 429) {
    const retryCount = options.retryCount ?? 0
    if (retryCount >= MAX_429_RETRIES) {
      throw new HabiticaApiError(429, undefined, 'Rate limited repeatedly — giving up.')
    }
    const retryAfterHeader = response.headers.get('Retry-After')
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 60_000
    await limiter.cooldown(retryAfterMs)
    return request<T>(path, { ...options, retryCount: retryCount + 1 })
  }

  const json = (await response.json().catch(() => undefined)) as
    | HabiticaEnvelope<T>
    | HabiticaErrorBody
    | undefined

  if (!response.ok || !json || json.success === false) {
    const errorBody = json && json.success === false ? (json as HabiticaErrorBody) : undefined
    throw new HabiticaApiError(
      response.status,
      errorBody,
      errorBody?.message ?? `Habitica API request failed with status ${response.status}`,
    )
  }

  return (json as HabiticaEnvelope<T>).data
}

export const habiticaClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /**
   * Validates credentials against GET /user without touching stored
   * credentials — used by the login screen so a bad User ID/Token pair
   * never gets persisted.
   */
  verifyCredentials: (credentials: HabiticaCredentials) =>
    request<HabiticaUser>('/user', { method: 'GET', credentialsOverride: credentials }),
}
