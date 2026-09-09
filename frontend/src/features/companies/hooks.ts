import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { showErrorDialog } from '@/components/ui/error-dialog'
import { usePermissions } from '@/features/auth/hooks'
import { useApiClient } from '@/lib/apiClient'
import { getApiErrorMessage } from '@/lib/errors'
import { COMPANIES_QUERY_KEY, MY_COMPANY_QUERY_KEY } from '@/lib/queryKeys'

import * as api from './api'
import type { CompanyCreateInput, CompanyUpdateInput } from './types'

export function useCompanies() {
  const client = useApiClient()
  return useQuery({
    queryKey: COMPANIES_QUERY_KEY,
    queryFn: () => api.listCompanies(client),
  })
}

// The current user's own company — for any of the four tenant roles. Deliberately not
// fetched at all for super_admin (enabled: false): that role has no company_id claim, so
// GET /api/v1/me/company would just 403 SUPER_ADMIN_NO_TENANT_ACCESS.
export function useMyCompany() {
  const client = useApiClient()
  const { role } = usePermissions()
  return useQuery({
    queryKey: MY_COMPANY_QUERY_KEY,
    queryFn: () => api.getMyCompany(client),
    enabled: role !== null && role !== 'super_admin',
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
