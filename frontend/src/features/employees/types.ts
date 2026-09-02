export interface Position {
  id: number
  company_id: number
  name: string
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
