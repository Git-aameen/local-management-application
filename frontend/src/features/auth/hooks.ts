import { useAuth0 } from '@auth0/auth0-react'

// Must match app/core/security.py's ROLE_CLAIM exactly — same namespaced custom claim,
// read here from the ID token (useAuth0().user) rather than the access token. This
// requires the Auth0 Action to set the claim on both tokens, which is the standard/
// recommended pattern for Auth0 Actions that set custom claims (typically
// `api.idToken.setCustomClaim(...)` alongside `api.accessToken.setCustomClaim(...)`); if
// this app's Action only sets it on the access token, `user` here won't carry it and every
// permission below will correctly fail closed to read-only.
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
 */
export function usePermissions(): Permissions {
  const { user } = useAuth0()
  const rawRole = user?.[ROLE_CLAIM]
  const role: Role | null = isKnownRole(rawRole) ? rawRole : null

  return {
    role,
    canManageEmployees: role === 'admin' || role === 'hr_manager',
    canManagePositions: role === 'admin' || role === 'hr_manager',
    canManageProducts: role === 'admin' || role === 'inventory_manager',
    canViewSalary: role === 'admin' || role === 'hr_manager',
    canManageCompanies: role === 'super_admin',
  }
}
