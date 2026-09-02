export interface Position {
  id: number
  company_id: number
  name: string
  created_at: string
}

export interface PositionCreateInput {
  name: string
}

export interface PositionUpdateInput {
  name?: string
}
