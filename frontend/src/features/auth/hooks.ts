import { useAuth0 } from '@auth0/auth0-react'
import { useQuery } from '@tanstack/react-query'

import { useApiClient } from '@/lib/apiClient'
import { MY_PERMISSIONS_QUERY_KEY } from '@/lib/queryKeys'

import { getMyPermissions } from './api'

// Must match app/core/security.py's claim constants exactly — these are namespaced custom
// claims Auth0 adds to the ID token via a Post-Login Action, not standard OIDC claims.
const ROLE_CLAIM = 'https://localmanagementapp.com/role'

// admin/hr_manager/inventory_manager/employee are tenant-scoped roles (a company_id claim
// always comes with them). super_admin is a separate, platform-level role for managing the
// Companies (tenants) resource itself — see CLAUDE.md § Authentication & Authorization.
export type Role = 'admin' | 'hr_manager' | 'inventory_manager' | 'employee' | 'super_admin'

const KNOWN_ROLES: readonly Role[] = [
  'admin',
  'hr_manager',
  'inventory_manager',
  'employee',
  'super_admin',
]

function isKnownRole(value: unknown): value is Role {
  return typeof value === 'string' && (KNOWN_ROLES as readonly string[]).includes(value)
}

export interface Permissions {
  /** The user's role, or null if missing/unrecognized (see "fail closed" note below). */
  role: Role | null
  /** Platform-level: create/rename companies (tenants), and the one signal the Sidebar's
   * "Companies" entry is disabled on. super_admin only — deliberately still read straight
   * from the JWT role, unlike every manage/access permission below (see CLAUDE.md §
   * Authentication & Authorization): this is an identity concern (are you the platform
   * operator role at all), not a Position-derived grant, so it was never part of the
   * Role-RBAC -> Position-permission consolidation. */
  canManageCompanies: boolean
}

/**
 * Identity-only: which role a token carries, and whether that role is the platform-level
 * super_admin. This is NOT where Employees/Positions/Products manage or access decisions
 * come from anymore — those are decided entirely by the caller's own Position permissions,
 * fetched from the backend via useMyPermissions() below (see CLAUDE.md § Authentication &
 * Authorization; app/core/dependencies.py::require_position_permission is the actual
 * server-side enforcement every one of those flags mirrors). A tenant user's token doesn't
 * even carry a role claim anymore — only super_admin tokens do — so `role` is always null
 * here for a tenant user; reading role from a JWT claim used to also double as a hardcoded
 * role -> permission map for those modules, but that map no longer exists here on purpose.
 *
 * Fails closed: if the role claim is missing, malformed, or not one of the five known
 * roles, `role` is null and canManageCompanies is false.
 */
export function usePermissions(): Permissions {
  const { user } = useAuth0()
  const rawRole = user?.[ROLE_CLAIM]
  const role: Role | null = isKnownRole(rawRole) ? rawRole : null

  return {
    role,
    canManageCompanies: role === 'super_admin',
  }
}

/**
 * Where to send the user immediately after a successful login — no intermediate landing
 * page or button click. super_admin has no company of its own to land a dashboard on, so it
 * goes to /select-company first; every other role (including an unrecognized/missing one,
 * which fails closed the same way the rest of this module does) goes straight to /dashboard.
 */
export function getPostLoginRedirectPath(role: Role | null): string {
  return role === 'super_admin' ? '/select-company' : '/dashboard'
}

/**
 * The current user's Position-derived permissions (GET /api/v1/me/permissions) — the SOLE
 * source of truth for whether Employees/Positions/Products can be reached and managed at
 * all (see app/core/dependencies.py::require_position_permission, which this mirrors
 * exactly, including its acting-as-company bypass). Every consumer (Sidebar's disabled
 * state, ProtectedRoute's requiredPermission, each list page's New/Edit/Delete controls)
 * reads directly from this hook's `data` now — there is no separate client-side role ->
 * permission map to keep in sync with it anymore.
 *
 * `data` is undefined while loading; every caller should default to `false` in that window
 * (fail closed — never show a manage control before we're sure it's allowed).
 */
export function useMyPermissions() {
  const client = useApiClient()
  return useQuery({
    queryKey: MY_PERMISSIONS_QUERY_KEY,
    queryFn: () => getMyPermissions(client),
  })
}
