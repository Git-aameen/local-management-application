import type { AxiosInstance } from 'axios'

import type { Position, PositionCreateInput, PositionUpdateInput } from './types'

// Companies have few positions in practice, so the list page shows them all at once
// rather than paginating — page_size=100 covers that; revisit if a company ever needs more.
const PAGE_SIZE = 100

export async function listPositions(client: AxiosInstance): Promise<Position[]> {
  const res = await client.get('/api/v1/positions', { params: { page: 1, page_size: PAGE_SIZE } })
  return res.data.data.items
}

export async function createPosition(
  client: AxiosInstance,
  input: PositionCreateInput,
): Promise<Position> {
  const res = await client.post('/api/v1/positions', input)
  return res.data.data
}

export async function updatePosition(
  client: AxiosInstance,
  id: number,
  input: PositionUpdateInput,
): Promise<Position> {
  const res = await client.put(`/api/v1/positions/${id}`, input)
  return res.data.data
}

export async function deletePosition(client: AxiosInstance, id: number): Promise<void> {
  await client.delete(`/api/v1/positions/${id}`)
}
