// A Position carries its own five permission flags directly (see
// backend/app/models/position.py and CLAUDE.md § Authentication & Authorization) — there is
// no more shared "Grade" concept.
export interface Position {
  id: number
  company_id: number
  name: string
  manage_employees: boolean
  manage_products: boolean
  manage_positions: boolean
  view_salary: boolean
  manage_special_permissions: boolean
  created_at: string
}

// The backend always includes salary in EmployeeResponse (there is no server-side,
// role-based field masking today — see CLAUDE.md § Sensitive Data Handling). Visibility is
// enforced entirely in the UI via useMyPermissions().view_salary (features/auth/hooks.ts):
// the table column and the form field are only rendered when the caller's own Position (or
// EmployeePermissionOverride) grants it. A technically savvy user without that grant could
// still retrieve raw salary via a direct API call (e.g. /docs) — this is a UI convenience,
// not a real access boundary; flag to the team if that gap needs closing.
export interface Employee {
  id: number
  company_id: number
  position_id: number
  full_name: string
  email: string
  hired_at: string
  // Decimal fields serialize as JSON strings on the wire (see Product.price) — parse with
  // Number() wherever this needs to be displayed or compared numerically.
  salary: string
  created_at: string
  updated_at: string
}

export interface EmployeeCreateInput {
  position_id: number
  full_name: string
  email: string
  hired_at: string
  salary: number
}

export interface EmployeeUpdateInput {
  position_id?: number
  full_name?: string
  email?: string
  hired_at?: string
  salary?: number
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

// A missing record on the backend is equivalent to one with every flag None ("no override,
// defer to the Position") — see app/models/employee_permission_override.py. GET always
// returns this shape, never a 404, and null is a real, distinct state from false (though
// the two behave identically under the additive OR with the Position's own flags).
export interface EmployeePermissionOverride {
  employee_id: number
  manage_employees: boolean | null
  manage_products: boolean | null
  manage_positions: boolean | null
  view_salary: boolean | null
}

export interface EmployeePermissionOverrideUpdateInput {
  manage_employees?: boolean | null
  manage_products?: boolean | null
  manage_positions?: boolean | null
  view_salary?: boolean | null
}
