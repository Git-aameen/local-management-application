import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { showErrorDialog } from '@/components/ui/error-dialog'
import { useApiClient } from '@/lib/apiClient'
import { getApiErrorMessage } from '@/lib/errors'
import { PRODUCTS_QUERY_KEY } from '@/lib/queryKeys'

import * as api from './api'
import type { ProductCreateInput, ProductUpdateInput } from './types'

export function useProducts(page: number, pageSize: number, category?: string) {
  const client = useApiClient()
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, page, pageSize, category ?? null],
    queryFn: () => api.listProducts(client, page, pageSize, category),
  })
}

// Powers the category filter dropdown: a broader, unfiltered sample (capped at 100
// products — there's no dedicated "distinct categories" endpoint) reduced to unique values.
export function useProductCategories() {
  const client = useApiClient()
  return useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'categories'],
    queryFn: async () => {
      const { items } = await api.listProducts(client, 1, 100)
      return Array.from(new Set(items.map((product) => product.category))).sort()
    },
  })
}

export function useCreateProduct() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProductCreateInput) => api.createProduct(client, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY })
      toast.success('Product created.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useUpdateProduct() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ProductUpdateInput }) =>
      api.updateProduct(client, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY })
      toast.success('Product updated.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useDeleteProduct() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteProduct(client, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY })
      toast.success('Product deleted.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}
