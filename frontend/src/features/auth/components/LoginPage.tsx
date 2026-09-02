import { useAuth0 } from '@auth0/auth0-react'
import { Navigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function LoginPage() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0()

  if (isLoading) {
    return <div className="flex min-h-svh items-center justify-center">Loading…</div>
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-medium">Local Management Application</h1>
      <Button type="button" onClick={() => loginWithRedirect()}>
        Log In
      </Button>
    </div>
  )
}
