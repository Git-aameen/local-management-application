import { useAuth0 } from '@auth0/auth0-react'
import { Navigate, Outlet } from 'react-router-dom'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth0()

  if (isLoading) {
    return <div className="flex min-h-svh items-center justify-center">Loading…</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
