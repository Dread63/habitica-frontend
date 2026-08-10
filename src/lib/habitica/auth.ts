const STORAGE_KEY = 'habitica-frontend:credentials'

export interface HabiticaCredentials {
  userId: string
  apiToken: string
}

export function getStoredCredentials(): HabiticaCredentials | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as HabiticaCredentials).userId === 'string' &&
      typeof (parsed as HabiticaCredentials).apiToken === 'string'
    ) {
      return parsed as HabiticaCredentials
    }
  } catch {
    // Corrupt value — treat as logged out rather than throwing.
  }
  return null
}

export function storeCredentials(credentials: HabiticaCredentials): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
}

export function clearCredentials(): void {
  window.localStorage.removeItem(STORAGE_KEY)
}
