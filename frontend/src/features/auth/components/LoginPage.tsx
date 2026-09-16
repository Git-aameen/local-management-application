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
    // Single unified composition (see ARCHITECTURE.md § 6) — replaces the old split-screen
    // (branding left / login right) layout. A backoffice login should read as a fast,
    // single-purpose gate, not a marketing hero: one glance at the brand mark, one button,
    // nothing to scroll past. The lava glow + gradient seam are the same visual language
    // already used for the Sidebar/content panel, not a one-off decoration.
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-6 py-12">
      {/* Decorative molten glow behind the card — existing lava tones only, no new hues.
       * aria-hidden since it carries no information. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute size-[820px] max-h-[90vw] max-w-[90vw] rounded-full opacity-40 blur-3xl"
        style={{
          background: 'radial-gradient(circle, var(--accent-ember) 0%, var(--accent) 45%, transparent 72%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-md border border-border bg-panel">
        <div className="h-[2px] w-full shrink-0 bg-gradient-to-r from-accent-ember via-accent to-accent-hot" />
        <div className="flex flex-col items-center gap-8 p-12 text-center sm:p-16">
          <div className="w-full">
            {/* Fluid font-size (not a fixed text-4xl/6xl breakpoint step) so this 28-
             * character name always fits on one line, at any viewport width, without
             * wrapping or overflowing — a fixed size that looks right on desktop either
             * wraps on mobile or has to jump awkwardly at a breakpoint. */}
            <h1
              className="font-display font-bold whitespace-nowrap text-panel-foreground"
              style={{ fontSize: 'clamp(0.75rem, calc(5.5vw - 0.5rem), 2.25rem)' }}
            >
              Local Management Application
            </h1>
            <p className="mt-3 text-base text-panel-foreground/70 sm:text-lg">
              Multi-tenant HR &amp; inventory backoffice
            </p>
          </div>

          <Button
            type="button"
            size="lg"
            className="w-full max-w-sm"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Logging in…' : 'Log In'}
          </Button>

          {popupUnavailable && (
            <div className="flex w-full max-w-sm flex-col gap-2 rounded-md border border-destructive/50 p-3 text-left">
              <p className="text-sm text-destructive-light" role="alert">
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
