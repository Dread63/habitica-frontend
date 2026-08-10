import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HabiticaApiError, useAuth } from './AuthProvider'

export function LoginScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [userId, setUserId] = React.useState('')
  const [apiToken, setApiToken] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login({ userId: userId.trim(), apiToken: apiToken.trim() })
      void navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof HabiticaApiError && err.status === 401) {
        setError('Those credentials were rejected by Habitica. Double-check your User ID and API Token.')
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Something went wrong logging in.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Connect your Habitica account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your User ID and API Token, found on{' '}
            <a
              href="https://habitica.com/user/settings/api"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              habitica.com/user/settings/api
            </a>
            . These are stored only in this browser and sent only to Habitica.
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1">
              <label htmlFor="userId" className="text-xs font-medium text-muted-foreground">
                User ID
              </label>
              <Input
                id="userId"
                autoComplete="off"
                spellCheck={false}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="apiToken" className="text-xs font-medium text-muted-foreground">
                API Token
              </label>
              <Input
                id="apiToken"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting} className="mt-1">
              {isSubmitting ? 'Connecting…' : 'Connect'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
