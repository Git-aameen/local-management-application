import { useQuery } from '@tanstack/react-query'

import { useApiClient } from '@/lib/apiClient'
import { MY_SUMMARY_QUERY_KEY } from '@/lib/queryKeys'

import * as api from './api'

export function useMySummary() {
  const client = useApiClient()
  return useQuery({
    queryKey: MY_SUMMARY_QUERY_KEY,
    queryFn: () => api.getMySummary(client),
  })
}
