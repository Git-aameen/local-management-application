import type { AxiosInstance } from 'axios'

import type { CompanySummary } from './types'

// Record counts for the current company context — the acting-as company for a super_admin
// using X-Acting-Company-Id (attached automatically by apiClient, see lib/actingCompany.ts),
// otherwise the caller's own company. No role restriction on the backend.
export async function getMySummary(client: AxiosInstance): Promise<CompanySummary> {
  const res = await client.get('/api/v1/me/summary')
  return res.data.data
}
