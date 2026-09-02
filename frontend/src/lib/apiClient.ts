import { useAuth0 } from '@auth0/auth0-react'
import axios from 'axios'
import { useEffect } from 'react'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

// useApiClient() is called from many independent hooks (useEmployees, useDeletePosition,
// etc.), often several at once on the same page. Registering a fresh
// apiClient.interceptors.request.use(...) inside a useEffect per call site — as this used
// to do — stacks up one interceptor per hook invocation on the shared apiClient singleton,
// and re-registers on every render where getAccessTokenSilently isn't referentially stable
// (it isn't, across most @auth0/auth0-react versions). That meant a single request could
// trigger several redundant, sequential getAccessTokenSilently() calls, and constant
// add/remove churn under React StrictMode's double-invoked effects — a real source of
// intermittent failures that surface to the user as a generic network error, unrelated to
// whether the backend actually responded.
//
// Fix: register exactly one interceptor, ever, and have it always read the latest token
// getter via a ref that a lightweight effect keeps current — no re-registration needed.
let latestTokenGetter: (() => Promise<string>) | null = null
let interceptorRegistered = false

function ensureAuthInterceptor() {
  if (interceptorRegistered) return
  interceptorRegistered = true
  apiClient.interceptors.request.use(async (config) => {
    if (latestTokenGetter) {
      const token = await latestTokenGetter()
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })
}

/** Attaches a fresh Auth0 access token as `Authorization: Bearer <token>` on every request. */
export function useApiClient() {
  const { getAccessTokenSilently } = useAuth0()

  useEffect(() => {
    latestTokenGetter = getAccessTokenSilently
  }, [getAccessTokenSilently])

  ensureAuthInterceptor()

  return apiClient
}
