import { Auth0Provider } from '@auth0/auth0-react'
import type { ReactNode } from 'react'

const domain = import.meta.env.VITE_AUTH0_DOMAIN
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
const audience = import.meta.env.VITE_AUTH0_AUDIENCE

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        audience,
        // Must land on /login, not "/" — "/" unconditionally redirects to /login
        // (see App.tsx) before Auth0Provider's mount-time effect gets a chance to read
        // the code/state query params off the URL, which would otherwise strip them and
        // leave isAuthenticated permanently false after a successful login.
        redirect_uri: `${window.location.origin}/login`,
      }}
    >
      {children}
    </Auth0Provider>
  )
}
