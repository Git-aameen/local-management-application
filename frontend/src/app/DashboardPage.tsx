import { useAuth0 } from '@auth0/auth0-react'
import { useEffect, useState } from 'react'
import { LogoutButton } from '../features/auth/components/LogoutButton'
import { useApiClient } from '../lib/apiClient'

type ApiStatus =
  | { state: 'loading' }
  | { state: 'success'; detail: string }
  | { state: 'error'; detail: string }

export function DashboardPage() {
  const { user } = useAuth0()
  const apiClient = useApiClient()
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ state: 'loading' })

  useEffect(() => {
    let cancelled = false
    apiClient
      .get('/api/v1/companies')
      .then((res) => {
        if (!cancelled) {
          setApiStatus({ state: 'success', detail: `${res.data.data.total} companies` })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          setApiStatus({ state: 'error', detail: message })
        }
      })
    return () => {
      cancelled = true
    }
  }, [apiClient])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-medium">Dashboard</h1>
      <p>Logged in as {user?.email}</p>
      <p className="text-sm text-neutral-500">
        Authenticated API call to /api/v1/companies: {apiStatus.state}
        {apiStatus.state !== 'loading' ? ` — ${apiStatus.detail}` : ''}
      </p>
      <LogoutButton />
    </div>
  )
}
