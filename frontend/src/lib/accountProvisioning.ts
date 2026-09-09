import { useEffect, useState } from 'react'

// A tiny global pub-sub, mirroring error-dialog.tsx's pattern: the apiClient response
// interceptor (which has no React context to work with) marks this flag from anywhere,
// and AppLayout subscribes to swap its entire subtree for a full-page message. Once set, it
// never unsets itself — a fresh Auth0 hosted-logout redirect leaves this page entirely, so
// the module gets reinitialized clean on the next visit rather than needing an explicit
// reset call.
type Listener = (value: boolean) => void

let isAccountNotProvisioned = false
const listeners = new Set<Listener>()

/** Called from apiClient's response interceptor on a 403 ACCOUNT_NOT_PROVISIONED response. */
export function markAccountNotProvisioned() {
  if (isAccountNotProvisioned) return
  isAccountNotProvisioned = true
  listeners.forEach((listener) => listener(true))
}

export function useAccountNotProvisioned(): boolean {
  const [value, setValue] = useState(isAccountNotProvisioned)

  useEffect(() => {
    listeners.add(setValue)
    return () => {
      listeners.delete(setValue)
    }
  }, [])

  return value
}
