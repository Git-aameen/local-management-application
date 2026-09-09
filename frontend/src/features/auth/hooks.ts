import { useAuth0 } from '@auth0/auth0-react'
import { useQuery } from '@tanstack/react-query'

import { useActingCompanyId } from '@/lib/actingCompany'
import { useApiClient } from '@/lib/apiClient'
import { MY_PERMISSIONS_QUERY_KEY } from '@/lib/queryKeys'

import { getMyPermissions } from './api'

// Must match app/core/security.py's claim constants exactly — these are namespaced custom
// claims Auth0 adds to the ID token via a Post-Login Action, not standard OIDC claims.
const ROLE_CLAIM = 'https://localmanagementapp.com/role'

// admin/hr_manager/inventory_manager/employee are tenant-scoped roles (a company_id claim
// always comes with them). super_admin is a separate, platform-level role for managing the
// Companies (tenants) resource itself — see CLAUDE.md § Authentication & Authorization. It
// deliberately does NOT satisfy any of the tenant-scoped canManageX checks below, even
// though "admin" is a substring of its name — they are unrelated roles.
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
  canManageEmployees: boolean
  canManagePositions: boolean
  canManageProducts: boolean
  /** Salary is sensitive (see CLAUDE.md § Sensitive Data Handling) — deliberately kept as
   * its own permission rather than reused from canManageEmployees, even though today's
   * role mapping happens to be identical, so the two concerns ("can edit employee
   * records" vs. "can see salary") can diverge later without a silent behavior change. */
  canViewSalary: boolean
  /** Platform-level: create/rename companies (tenants). super_admin only — never true for
   * any of the four tenant-scoped roles, including plain "admin". */
  canManageCompanies: boolean
}

/**
 * UI-only mirror of the backend's require_role() checks — see CLAUDE.md § Authentication &
 * Authorization and app/api/v1/{companies,employees,positions,products}.py. The mapping
 * here must stay identical to those require_role([...]) lists; it exists purely to hide
 * controls the user isn't allowed to use, NOT to enforce access — the backend remains the
 * sole source of truth and rejects unauthorized requests regardless of what this hook
 * returns.
 *
 * Fails closed: if the role claim is missing, malformed, or not one of the five known
 * roles, `role` is null and every permission below is false — never falls back to full
 * access.
 *
 * "Act as company" mode (see lib/actingCompany.ts and CLAUDE.md § Authentication &
 * Authorization): while a super_admin has chosen a company via /select-company, the four
 * tenant-scoped booleans below light up exactly as they would for a real "admin" of that
 * company — mirroring get_effective_role() on the backend — so the SAME Employees/Products/
 * Positions pages, unchanged, naturally show their CRUD controls. `role` itself is
 * deliberately NOT overridden to "admin": it stays "super_admin" so identity-based checks
 * (canManageCompanies, and useMyCompany()'s own enabled gate) are unaffected by acting mode.
 */
export function usePermissions(): Permissions {
  const { user } = useAuth0()
  const rawRole = user?.[ROLE_CLAIM]
  const role: Role | null = isKnownRole(rawRole) ? rawRole : null
  const actingCompanyId = useActingCompanyId()
  const isActingAsAdmin = role === 'super_admin' && actingCompanyId !== null

  return {
    role,
    canManageEmployees: role === 'admin' || role === 'hr_manager' || isActingAsAdmin,
    canManagePositions: role === 'admin' || role === 'hr_manager' || isActingAsAdmin,
    canManageProducts: role === 'admin' || role === 'inventory_manager' || isActingAsAdmin,
    canViewSalary: role === 'admin' || role === 'hr_manager' || isActingAsAdmin,
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
 * Backend-derived effective permissions (GET /api/v1/me/permissions) — unlike
 * usePermissions() above (a pure client-side ID token read), this reflects the real
 * position/grade-derived OR logic for can_view_salary: (role is admin/hr_manager) OR (the
 * caller's own position's can_view_salary, defaulted from a Grade — see
 * app/models/grade.py). Used specifically for salary visibility (EmployeeListPage's salary
 * column, EmployeeFormDialog's salary field) since that's the one permission that can't be
 * computed from the token alone. The other three can_manage_* flags keep coming from
 * usePermissions() everywhere else — this hook is not a wholesale replacement for it.
 */
export function useMyPermissions() {
  const client = useApiClient()
  return useQuery({
    queryKey: MY_PERMISSIONS_QUERY_KEY,
    queryFn: () => getMyPermissions(client),
  })
}
