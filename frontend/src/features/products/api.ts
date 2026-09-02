import type { AxiosInstance } from 'axios'

import type { Paginated, Product, ProductCreateInput, ProductUpdateInput } from './types'

export async function listProducts(
  client: AxiosInstance,
  page: number,
  pageSize: number,
  category?: string,
): Promise<Paginated<Product>> {
  const res = await client.get('/api/v1/products', {
    params: { page, page_size: pageSize, ...(category ? { category } : {}) },
  })
  return res.data.data
}

export async function createProduct(
  client: AxiosInstance,
  input: ProductCreateInput,
): Promise<Product> {
  const res = await client.post('/api/v1/products', input)
  return res.data.data
}

export async function updateProduct(
  client: AxiosInstance,
  id: number,
  input: ProductUpdateInput,
): Promise<Product> {
  const res = await client.put(`/api/v1/products/${id}`, input)
  return res.data.data
}

export async function deleteProduct(client: AxiosInstance, id: number): Promise<void> {
  await client.delete(`/api/v1/products/${id}`)
}
