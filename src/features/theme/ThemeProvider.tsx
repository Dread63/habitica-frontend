import * as React from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'habitica-frontend:theme'

interface ThemeContextValue {
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

/**
 * Resolves a preference to the class that should actually be on <html>.
 * 'system' isn't a third class — it resolves to whichever of light/dark the
 * OS currently reports.
 */
function resolveClass(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Bug fixed here: this used to add *no* class for 'system' and rely on
 * index.css's `@media (prefers-color-scheme: dark)` block to swap the CSS
 * custom properties. That covers color *tokens* (--background etc.), but
 * every Tailwind `dark:` utility in the app compiles against the custom
 * variant `&:where(.dark, .dark *)` (see index.css) — a pure class
 * selector, blind to the media query. So for anyone on 'system' whose OS is
 * actually in dark mode, the CSS variables correctly went dark but every
 * `dark:` utility (prose-invert on markdown text, TagChip's excluded-state
 * color, …) silently no-opped, rendering light-mode text colors on a dark
 * background — reported as "rendered markdown text is some grey/dark blue
 * and impossible to read". Always applying the *resolved* class fixes both
 * paths through the same mechanism instead of two parallel ones.
 */
function applyPreference(preference: ThemePreference) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolveClass(preference))
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
    if (preference !== 'system') return
    // Live-follow OS theme changes while on 'system' — otherwise switching
    // the OS theme mid-session wouldn't flip the resolved class until
    // something else re-ran this effect (e.g. the user touching the toggle).
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyPreference('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
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
