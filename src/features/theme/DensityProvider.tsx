import * as React from 'react'

export type Density = 'comfortable' | 'compact'

const STORAGE_KEY = 'habitica-frontend:density'

interface DensityContextValue {
  density: Density
  toggleDensity: () => void
}

const DensityContext = React.createContext<DensityContextValue | null>(null)

function readStoredDensity(): Density {
  if (typeof window === 'undefined') return 'comfortable'
  return window.localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable'
}

/**
 * Unlike theme, density has no OS-level signal to fall back to (no
 * `prefers-density` media query), so this is a plain two-state toggle
 * rather than ThemeProvider's three-state light/dark/system — and since
 * nothing here needs a CSS custom property cascade, there's no root class
 * to apply either; components just read `density` directly and pick classes.
 */
export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensity] = React.useState<Density>(readStoredDensity)

  const toggleDensity = React.useCallback(() => {
    setDensity((prev) => {
      const next: Density = prev === 'compact' ? 'comfortable' : 'compact'
      window.localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  const value = React.useMemo(() => ({ density, toggleDensity }), [density, toggleDensity])

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
}

export function useDensity() {
  const ctx = React.useContext(DensityContext)
  if (!ctx) throw new Error('useDensity must be used within a DensityProvider')
  return ctx
}
