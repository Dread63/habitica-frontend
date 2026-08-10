import * as React from 'react'
import { habiticaClient, HabiticaApiError } from '@/lib/habitica/client'
import {
  clearCredentials,
  getStoredCredentials,
  storeCredentials,
  type HabiticaCredentials,
} from '@/lib/habitica/auth'

interface AuthContextValue {
  credentials: HabiticaCredentials | null
  isAuthenticated: boolean
  /** Verifies against GET /user before storing — throws HabiticaApiError on bad credentials. */
  login: (credentials: HabiticaCredentials) => Promise<void>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [credentials, setCredentials] = React.useState<HabiticaCredentials | null>(
    getStoredCredentials,
  )

  const login = React.useCallback(async (next: HabiticaCredentials) => {
    // Throws HabiticaApiError on invalid credentials — let the caller (the
    // login form) catch it and show a message. Nothing is persisted until
    // this succeeds.
    await habiticaClient.verifyCredentials(next)
    storeCredentials(next)
    setCredentials(next)
  }, [])

  const logout = React.useCallback(() => {
    clearCredentials()
    setCredentials(null)
  }, [])

  const value = React.useMemo(
    () => ({ credentials, isAuthenticated: credentials !== null, login, logout }),
    [credentials, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

export { HabiticaApiError }
