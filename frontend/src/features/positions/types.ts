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

export interface PositionCreateInput {
  name: string
  grade_code?: string | null
}

export interface PositionUpdateInput {
  name?: string
  grade_code?: string | null
}
