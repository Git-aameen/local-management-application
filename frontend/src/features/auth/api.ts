import type { AxiosInstance } from 'axios'

// Mirrors backend/app/schemas/permissions.py::EffectivePermissionsResponse. Unlike
// usePermissions() (a pure client-side ID token read, see hooks.ts), can_view_salary here
// reflects the real OR logic — (system role is admin/hr_manager) OR (the caller's own
// position's Grade allows it) OR (the caller's own EmployeeSpecialPermission record allows
// it) — which only the backend can know, since the frontend never sees the caller's own
// Employee/Position/Grade/EmployeeSpecialPermission rows directly.
export interface MyPermissions {
  role: string
  can_manage_employees: boolean
  can_manage_products: boolean
  can_manage_positions: boolean
  can_view_salary: boolean
  // A different question from the four flags above: whether the caller may view/edit ANY
  // employee's special-permissions record at all (system role "admin" OR an Admin-grade
  // "A" position) — gates SpecialPermissionsSection.tsx, not itself OR-combined into access.
  can_manage_special_permissions: boolean
}

export async function getMyPermissions(client: AxiosInstance): Promise<MyPermissions> {
  const res = await client.get('/api/v1/me/permissions')
  return res.data.data
}
