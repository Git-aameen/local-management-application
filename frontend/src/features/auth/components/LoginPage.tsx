import { useAuth0 } from '@auth0/auth0-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'

import { getPostLoginRedirectPath, usePermissions } from '../hooks'

// The only entry point into the app — authentication itself is entirely delegated to
// Auth0's hosted Universal Login (Authorization Code + PKCE, see AuthProvider.tsx), opened
// in a popup (loginWithPopup) rather than a full-page redirect so the app never fully
// navigates away. This page never sees a password; once the popup reports success,
// isAuthenticated flips true and the branch below forwards on to the right landing page —
// same getPostLoginRedirectPath() logic either flow would use.
export function LoginPage() {
  const { loginWithPopup, loginWithRedirect, isAuthenticated, isLoading } = useAuth0()
  const { role } = usePermissions()
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [popupUnavailable, setPopupUnavailable] = useState(false)

  if (isLoading) {
    return <div className="flex min-h-svh items-center justify-center">Loading…</div>
  }

  if (isAuthenticated) {
    return <Navigate to={getPostLoginRedirectPath(role)} replace />
  }

  async function handleLogin() {
    setPopupUnavailable(false)
    setIsLoggingIn(true)
    try {
      await loginWithPopup()
    } catch {
      // Covers every way the popup can fail to complete a login — the browser (or an
      // extension) blocking window.open outright, the user closing the popup before
      // finishing, a popup timeout, etc. All of them need the same fallback: offer the
      // full-page redirect flow instead, which every browser allows unconditionally.
      setPopupUnavailable(true)
    } finally {
      setIsLoggingIn(false)
    }
  }

  return (
    <div className="grid min-h-svh grid-cols-1 md:grid-cols-2">
      <div className="hidden flex-col items-center justify-center gap-2 bg-muted p-10 md:flex">
        <h1 className="text-3xl font-semibold">Local Management Application</h1>
        <p className="text-center text-muted-foreground">
          Multi-tenant HR &amp; inventory backoffice
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-medium md:hidden">Local Management Application</h1>
        <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <h2 className="text-xl font-medium">Log in</h2>
          <p className="text-sm text-muted-foreground">
            Sign in with your Local Management Application account.
          </p>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Logging in…' : 'Log In'}
          </Button>

          {popupUnavailable && (
            <div className="flex w-full flex-col gap-2 rounded-md border border-destructive/50 p-3">
              <p className="text-sm text-destructive" role="alert">
                We couldn't open the login popup. Your browser (or an extension) may be
                blocking pop-ups for this site — allow them and try again, or continue below.
              </p>
              <Button type="button" variant="outline" onClick={() => loginWithRedirect()}>
                Continue without a popup
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
