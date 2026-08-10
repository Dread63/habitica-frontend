import { Routes, Route } from 'react-router-dom'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { Dashboard } from '@/features/tasks/Dashboard'

export function App() {
  return (
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
  )
}
