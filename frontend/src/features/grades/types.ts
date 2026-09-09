// No surrogate id — (company_id, code) is the primary key server-side (see
// backend/app/models/grade.py). `code` is what GET/PUT/DELETE /api/v1/grades/{code}
// identify a grade by.
export interface Grade {
  company_id: number
  code: string
  name: string
  level: number
  can_manage_employees: boolean
  can_manage_products: boolean
  can_manage_positions: boolean
  can_view_salary: boolean
  created_at: string
}

export interface GradeCreateInput {
  code: string
  name: string
  level: number
  can_manage_employees?: boolean
  can_manage_products?: boolean
  can_manage_positions?: boolean
  can_view_salary?: boolean
}

export interface GradeUpdateInput {
  code?: string
  name?: string
  level?: number
  can_manage_employees?: boolean
  can_manage_products?: boolean
  can_manage_positions?: boolean
  can_view_salary?: boolean
}
