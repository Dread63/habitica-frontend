import { RateLimiter } from './rateLimiter'
import { getStoredCredentials, type HabiticaCredentials } from './auth'
import type { HabiticaEnvelope, HabiticaErrorBody, HabiticaUser } from './types'

const BASE_URL = 'https://habitica.com/api/v3'
const MAX_429_RETRIES = 3

/** The `<appname>` half of the mandatory `x-client` header. */
const APP_NAME = 'habitica-modern-frontend'

/**
 * Habitica requires `x-client: <user-id>-<appname>` on every request (see
 * docs/habitica-api.md) and rejects anything without it.
 *
 * This used to be a build-time constant, `VITE_HABITICA_CLIENT_ID`, which
 * every deployment had to set to its own `<user-id>-habitica-modern-frontend`
 * before building. That was never necessary: the user id in that header is
 * the same one already being sent as `x-api-user` on the very same request,
 * and it's available from the moment the login form is filled in — including
 * on the credential-verification call, which runs before anything is stored.
 * Deriving it removes the app's only build-time configuration, which is what
 * makes a single prebuilt image usable by anyone (see docs/deploy-synology.md)
 * rather than being personal to whoever built it.
 */
function clientHeader(credentials: HabiticaCredentials): string {
  return `${credentials.userId}-${APP_NAME}`
}

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
  await limiter.acquire()

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-user': credentials.userId,
      'x-api-key': credentials.apiToken,
      'x-client': clientHeader(credentials),
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
