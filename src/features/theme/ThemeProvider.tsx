import * as React from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'habitica-frontend:theme'

interface ThemeContextValue {
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function applyPreference(preference: ThemePreference) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (preference !== 'system') {
    root.classList.add(preference)
  }
  // 'system' adds neither class — index.css's prefers-color-scheme query
  // (guarded as :root:not(.light)) takes over.
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>(readStoredPreference)

  React.useEffect(() => {
    applyPreference(preference)
  }, [preference])

  const setPreference = React.useCallback((pref: ThemePreference) => {
    window.localStorage.setItem(STORAGE_KEY, pref)
    setPreferenceState(pref)
  }, [])

  const value = React.useMemo(() => ({ preference, setPreference }), [preference, setPreference])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
