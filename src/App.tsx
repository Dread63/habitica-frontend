import { NavLink, Routes, Route } from 'react-router-dom'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { useAuth } from '@/features/auth/AuthProvider'
import { Dashboard } from '@/features/tasks/Dashboard'
import { TimelinePage } from '@/features/timeline/TimelinePage'
import { PomodoroStatusPill } from '@/features/pomodoro/PomodoroStatusPill'
import { useTimelineSnapshotSync } from '@/features/timeline/useTimelineSnapshotSync'
import { useFocusSync } from '@/lib/sync/useFocusSync'
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialogHost'
import { PromptDialogHost } from '@/components/ui/PromptDialogHost'
import { cn } from '@/lib/utils'

/**
 * The only shared chrome across routes: tab links plus the always-mounted
 * pomodoro pill (which owns the timer's clock loop — see
 * PomodoroStatusPill). Hidden while logged out; each page keeps its own
 * header below this strip.
 */
/** Renders nothing — exists so the sync hook can be mounted behind the auth
 * check without putting a conditional hook call in AppNav. */
function TimelineSnapshotSync() {
  useTimelineSnapshotSync()
  // Mirrors timeline placements and focus history to the NAS when a sync
  // service is deployed; a no-op (after one probe) when it isn't.
  useFocusSync()
  return null
}

function AppNav() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return null

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
      isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <nav className="flex items-center gap-1 border-b border-border px-4 py-2 sm:px-6">
      <NavLink to="/" end className={linkClass}>
        Dashboard
      </NavLink>
      <NavLink to="/timeline" className={linkClass}>
        Timeline
      </NavLink>
      <div className="ml-auto">
        <PomodoroStatusPill />
      </div>
      <TimelineSnapshotSync />
    </nav>
  )
}

export function App() {
  return (
    <>
      <AppNav />
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/timeline"
          element={
            <RequireAuth>
              <TimelinePage />
            </RequireAuth>
          }
        />
      </Routes>
      {/* Mounted once here rather than per call site — see confirmStore.ts/
          promptStore.ts, the app's replacement for window.confirm/prompt. */}
      <ConfirmDialogHost />
      <PromptDialogHost />
    </>
  )
}
