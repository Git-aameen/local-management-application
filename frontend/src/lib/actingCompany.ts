import { useEffect, useState } from 'react'

import { queryClient } from '@/lib/queryClient'
import {
  EMPLOYEES_QUERY_KEY,
  MY_PERMISSIONS_QUERY_KEY,
  MY_SUMMARY_QUERY_KEY,
  POSITIONS_QUERY_KEY,
  PRODUCTS_QUERY_KEY,
} from '@/lib/queryKeys'

// The company a super_admin has chosen to "act as" (see CLAUDE.md § Authentication &
// Authorization) — plain module state, deliberately NOT persisted to storage, so it always
// resets to null on a full page reload or a logout redirect rather than silently resuming a
// stale acting session for whoever logs in next in the same tab. apiClient's request
// interceptor reads getActingCompanyId() directly (see lib/apiClient.ts) to attach
// X-Acting-Company-Id on every request while this is set.
type Listener = (companyId: number | null) => void

let actingCompanyId: number | null = null
const listeners = new Set<Listener>()

// Employees/Products/Positions/summary are all scoped by whichever company is currently
// active, but their React Query cache keys don't encode that — they never needed to before
// acting mode existed, since a session only ever had one company for its whole lifetime.
// Switching companies therefore has to explicitly invalidate them here, or the UI would go
// on showing the previous company's cached data until some unrelated refetch happened.
function invalidateCompanyScopedQueries() {
  queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY })
  queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY })
  queryClient.invalidateQueries({ queryKey: POSITIONS_QUERY_KEY })
  queryClient.invalidateQueries({ queryKey: MY_SUMMARY_QUERY_KEY })
  queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_QUERY_KEY })
}

/** Called when a super_admin picks a company on /select-company, or clears it via "Switch
 * company" in the Topbar (pass null). */
export function setActingCompanyId(companyId: number | null) {
  actingCompanyId = companyId
  listeners.forEach((listener) => listener(companyId))
  invalidateCompanyScopedQueries()
}

/** Synchronous read for non-React code — the apiClient request interceptor. */
export function getActingCompanyId(): number | null {
  return actingCompanyId
}

export function useActingCompanyId(): number | null {
  const [value, setValue] = useState(actingCompanyId)

  useEffect(() => {
    listeners.add(setValue)
    return () => {
      listeners.delete(setValue)
    }
  }, [])

  return value
}
