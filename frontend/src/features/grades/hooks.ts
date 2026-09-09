import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { showErrorDialog } from '@/components/ui/error-dialog'
import { useApiClient } from '@/lib/apiClient'
import { getApiErrorMessage } from '@/lib/errors'
import { GRADES_QUERY_KEY, POSITIONS_QUERY_KEY } from '@/lib/queryKeys'

import * as api from './api'
import type { GradeCreateInput, GradeUpdateInput } from './types'

// Shared with features/positions/components/PositionFormDialog.tsx's grade dropdown —
// invalidating this here (see useCreateGrade/useUpdateGrade/useDeleteGrade) keeps that
// dropdown's options current automatically, same pattern as POSITIONS_QUERY_KEY being
// shared between the Positions page and the Employee form (see features/positions/hooks.ts).
export function useGrades() {
  const client = useApiClient()
  return useQuery({
    queryKey: GRADES_QUERY_KEY,
    queryFn: () => api.listGrades(client),
  })
}

export function useCreateGrade() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GradeCreateInput) => api.createGrade(client, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRADES_QUERY_KEY })
      toast.success('Grade created.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useUpdateGrade() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ code, input }: { code: string; input: GradeUpdateInput }) =>
      api.updateGrade(client, code, input),
    onSuccess: () => {
      // A rename (input.code) changes every Position's grade_code that referenced it too
      // (ON UPDATE CASCADE, server-side — see app/models/position.py), so Positions' own
      // cached data is just as stale as Grades' here.
      queryClient.invalidateQueries({ queryKey: GRADES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: POSITIONS_QUERY_KEY })
      toast.success('Grade updated.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}

export function useDeleteGrade() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api.deleteGrade(client, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRADES_QUERY_KEY })
      toast.success('Grade deleted.')
    },
    onError: (error) => {
      showErrorDialog(getApiErrorMessage(error))
    },
  })
}
