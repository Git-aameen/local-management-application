import type { AxiosInstance } from 'axios'

import type { Grade, GradeCreateInput, GradeUpdateInput } from './types'

// Companies have few grades in practice, so the list page shows them all at once rather
// than paginating — page_size=100 covers that; revisit if a company ever needs more (same
// convention as features/positions/api.ts).
const PAGE_SIZE = 100

export async function listGrades(client: AxiosInstance): Promise<Grade[]> {
  const res = await client.get('/api/v1/grades', { params: { page: 1, page_size: PAGE_SIZE } })
  return res.data.data.items
}

export async function createGrade(client: AxiosInstance, input: GradeCreateInput): Promise<Grade> {
  const res = await client.post('/api/v1/grades', input)
  return res.data.data
}

export async function updateGrade(
  client: AxiosInstance,
  code: string,
  input: GradeUpdateInput,
): Promise<Grade> {
  const res = await client.put(`/api/v1/grades/${encodeURIComponent(code)}`, input)
  return res.data.data
}

export async function deleteGrade(client: AxiosInstance, code: string): Promise<void> {
  await client.delete(`/api/v1/grades/${encodeURIComponent(code)}`)
}
