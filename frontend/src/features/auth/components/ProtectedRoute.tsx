import { useAuth0 } from '@auth0/auth0-react'
import { Navigate, Outlet } from 'react-router-dom'

import { AccessDeniedPage } from './AccessDeniedPage'
import type { MyPermissions } from '../api'
import { useMyPermissions } from '../hooks'

type BooleanPermissionKey = {
  [K in keyof MyPermissions]: MyPermissions[K] extends boolean ? K : never
}[keyof MyPermissions]

interface ProtectedRouteProps {
  /** When given, also gates this route (and its children) on one boolean flag from
   * useMyPermissions() — e.g. "manage_employees" — in addition to plain authentication.
   * A logged-in user who fails this check sees AccessDeniedPage rather than being silently
   * redirected, since reaching this route (as opposed to never seeing its nav link at all)
   * means they typed the URL directly. Omit for routes that only need authentication. */
  requiredPermission?: BooleanPermissionKey
}

export function ProtectedRoute({ requiredPermission }: ProtectedRouteProps = {}) {
  const { isAuthenticated, isLoading } = useAuth0()
  // Only fetched/consulted when requiredPermission is actually given — routes with no
  // permission requirement (most of them) never wait on this or care whether it's loaded.
  const { data: myPermissions, isLoading: isPermissionsLoading } = useMyPermissions()

  if (isLoading) {
    return <div className="flex min-h-svh items-center justify-center">Loading…</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredPermission) {
    if (isPermissionsLoading) {
      return <div className="flex min-h-svh items-center justify-center">Loading…</div>
    }
    if (!myPermissions?.[requiredPermission]) {
      return <AccessDeniedPage />
    }
  }

  return <Outlet />
}
