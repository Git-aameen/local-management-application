// A Position carries its own five permission flags directly (see
// backend/app/models/position.py and CLAUDE.md § Authentication & Authorization) — there is
// no more shared "Grade" concept; each Position is configured independently.
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

export interface PositionCreateInput {
  name: string
  manage_employees?: boolean
  manage_products?: boolean
  manage_positions?: boolean
  view_salary?: boolean
  manage_special_permissions?: boolean
}

export interface PositionUpdateInput {
  name?: string
  manage_employees?: boolean
  manage_products?: boolean
  manage_positions?: boolean
  view_salary?: boolean
  manage_special_permissions?: boolean
}
