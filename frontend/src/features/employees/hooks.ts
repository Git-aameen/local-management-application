import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { showErrorDialog } from '@/components/ui/error-dialog'
import { useApiClient } from '@/lib/apiClient'
import { getApiErrorMessage } from '@/lib/errors'
import { EMPLOYEES_QUERY_KEY, POSITIONS_QUERY_KEY } from '@/lib/queryKeys'

import * as api from './api'
import type { EmployeeCreateInput, EmployeeUpdateInput } from './types'

export function useEmployees(page: number, pageSize: number) {
  const client = useApiClient()
  return useQuery({
    queryKey: [...EMPLOYEES_QUERY_KEY, page, pageSize],
    queryFn: () => api.listEmployees(client, page, pageSize),
  })
}

export function usePositions() {
  const client = useApiClient()
  return useQuery({
    queryKey: POSITIONS_QUERY_KEY,
    queryFn: () => api.listPositions(client),
  })
}

export function useCreateEmployee() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: EmployeeCreateInput) => api.createEmployee(client, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY })
      toast.success('Employee created.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useUpdateEmployee() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: EmployeeUpdateInput }) =>
      api.updateEmployee(client, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY })
      toast.success('Employee updated.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useDeleteEmployee() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteEmployee(client, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY })
      toast.success('Employee deleted.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}
