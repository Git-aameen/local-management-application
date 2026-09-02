import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { showErrorDialog } from '@/components/ui/error-dialog'
import { useApiClient } from '@/lib/apiClient'
import { getApiErrorMessage } from '@/lib/errors'
import { POSITIONS_QUERY_KEY } from '@/lib/queryKeys'

import * as api from './api'
import type { PositionCreateInput, PositionUpdateInput } from './types'

// This shares POSITIONS_QUERY_KEY with features/employees/hooks.ts's usePositions() — the
// same cache entry backs both the table on this page and the Employee form's position
// dropdown, so invalidating it here (see useCreatePosition) refreshes both automatically.
export function usePositions() {
  const client = useApiClient()
  return useQuery({
    queryKey: POSITIONS_QUERY_KEY,
    queryFn: () => api.listPositions(client),
  })
}

export function useCreatePosition() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PositionCreateInput) => api.createPosition(client, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POSITIONS_QUERY_KEY })
      toast.success('Position created.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useUpdatePosition() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PositionUpdateInput }) =>
      api.updatePosition(client, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POSITIONS_QUERY_KEY })
      toast.success('Position updated.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useDeletePosition() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deletePosition(client, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POSITIONS_QUERY_KEY })
      toast.success('Position deleted.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}
