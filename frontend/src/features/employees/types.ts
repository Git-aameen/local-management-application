// Read-only snapshot of the position's linked Grade's permission flags (see
// backend/app/schemas/position.py::PositionGradePermissions) — null if the position has no
// grade. Always reflects the Grade's current flags, fetched fresh alongside the Position.
export interface PositionGradePermissions {
  can_manage_employees: boolean
  can_manage_products: boolean
  can_manage_positions: boolean
  can_view_salary: boolean
}

export interface Position {
  id: number
  company_id: number
  name: string
  // Half of a composite foreign key (company_id, grade_code) -> grades(company_id, code) —
  // see backend/app/models/position.py. No numeric grade id exists server-side anymore.
  grade_code: string | null
  grade_permissions: PositionGradePermissions | null
  created_at: string
}

// The backend always includes salary in EmployeeResponse (there is no server-side,
// role-based field masking today — see CLAUDE.md § Sensitive Data Handling). Visibility is
// enforced entirely in the UI via usePermissions().canViewSalary: the table column and the
// form field are only rendered for admin/hr_manager. A technically savvy "employee"-role
// user could still retrieve raw salary via a direct API call (e.g. /docs) — this is a UI
// convenience, not a real access boundary; flag to the team if that gap needs closing.
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

// A missing record on the backend is equivalent to one with every flag false (see
// app/models/employee_special_permission.py) — GET always returns this shape, never a 404.
export interface EmployeeSpecialPermissions {
  employee_id: number
  can_manage_employees: boolean
  can_manage_products: boolean
  can_manage_positions: boolean
  can_view_salary: boolean
}

export interface EmployeeSpecialPermissionsUpdateInput {
  can_manage_employees?: boolean
  can_manage_products?: boolean
  can_manage_positions?: boolean
  can_view_salary?: boolean
}
