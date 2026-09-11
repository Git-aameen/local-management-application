import type { AxiosInstance } from 'axios'

// Mirrors backend/app/schemas/permissions.py::EffectivePermissionsResponse. The five
// manage_*/view_salary flags below are the SOLE source of truth for whether
// Employees/Positions/Products can be reached and managed at all (see
// require_position_permission in app/core/dependencies.py) — (the caller's own Position
// allows it) OR (the caller's own EmployeePermissionOverride record allows it, for the four
// that have one — manage_special_permissions has no override counterpart), plus an
// unconditional grant while a super_admin is acting as a company. The JWT role plays no part
// in any of these anymore; see features/auth/hooks.ts::usePermissions() for the
// identity-only concerns (canManageCompanies) that still do read the role directly.
export interface MyPermissions {
  // null for every tenant user — only a super_admin token carries a role claim at all now
  // (see CLAUDE.md § Authentication & Authorization).
  role: string | null
  manage_employees: boolean
  manage_products: boolean
  manage_positions: boolean
  view_salary: boolean
  // Whether the caller may view/edit ANY employee's special-permissions record at all — just
  // another Position flag now, gating PermissionOverrideSection.tsx.
  manage_special_permissions: boolean
}

export async function getMyPermissions(client: AxiosInstance): Promise<MyPermissions> {
  const res = await client.get('/api/v1/me/permissions')
  return res.data.data
}
