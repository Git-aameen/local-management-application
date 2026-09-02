export interface Company {
  id: number
  name: string
  created_at: string
}

export interface CompanyCreateInput {
  name: string
}

export interface CompanyUpdateInput {
  name?: string
}
