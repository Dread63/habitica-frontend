import { Routes, Route } from 'react-router-dom'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { Dashboard } from '@/features/tasks/Dashboard'
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialogHost'
import { PromptDialogHost } from '@/components/ui/PromptDialogHost'

export function App() {
  return (
    <>
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
      </Routes>
      {/* Mounted once here rather than per call site — see confirmStore.ts/
          promptStore.ts, the app's replacement for window.confirm/prompt. */}
      <ConfirmDialogHost />
      <PromptDialogHost />
    </>
  )
}
