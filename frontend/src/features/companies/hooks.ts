import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { showErrorDialog } from '@/components/ui/error-dialog'
import { useApiClient } from '@/lib/apiClient'
import { getApiErrorMessage } from '@/lib/errors'
import { COMPANIES_QUERY_KEY } from '@/lib/queryKeys'

import * as api from './api'
import type { CompanyCreateInput, CompanyUpdateInput } from './types'

export function useCompanies() {
  const client = useApiClient()
  return useQuery({
    queryKey: COMPANIES_QUERY_KEY,
    queryFn: () => api.listCompanies(client),
  })
}

export function useCreateCompany() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CompanyCreateInput) => api.createCompany(client, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY })
      toast.success('Company created.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useUpdateCompany() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CompanyUpdateInput }) =>
      api.updateCompany(client, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY })
      toast.success('Company updated.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}
