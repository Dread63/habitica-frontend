import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { App } from './App.tsx'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { DensityProvider } from '@/features/theme/DensityProvider'
import { AuthProvider } from '@/features/auth/AuthProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Habitica's 30 req/60s limit means aggressive refetch-on-focus etc.
      // is the wrong default here; the rate limiter in lib/habitica/client
      // queues rather than drops requests, but there's no reason to invite
      // avoidable ones.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <DensityProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </DensityProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
