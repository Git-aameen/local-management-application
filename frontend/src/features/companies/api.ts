import type { AxiosInstance } from 'axios'

import type { Company, CompanyCreateInput, CompanyUpdateInput } from './types'

// Companies (tenants) are managed by platform operators (super_admin) and are expected to
// be few in absolute terms — no UI pagination, matching the Positions pattern.
const PAGE_SIZE = 100

export async function listCompanies(client: AxiosInstance): Promise<Company[]> {
  const res = await client.get('/api/v1/companies', { params: { page: 1, page_size: PAGE_SIZE } })
  return res.data.data.items
}

export async function createCompany(
  client: AxiosInstance,
  input: CompanyCreateInput,
): Promise<Company> {
  const res = await client.post('/api/v1/companies', input)
  return res.data.data
}

export async function updateCompany(
  client: AxiosInstance,
  id: number,
  input: CompanyUpdateInput,
): Promise<Company> {
  const res = await client.put(`/api/v1/companies/${id}`, input)
  return res.data.data
}

// No deleteCompany — deliberately omitted. Deleting a company would cascade-affect all of
// its employees/products/positions (they're FK-linked to it), which is too risky to expose
// in the UI yet. See CompanyListPage.tsx.
