import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import { LogoutButton } from '../features/auth/components/LogoutButton'

export function HomePage() {
  const { isAuthenticated, isLoading } = useAuth0()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-medium">Local Management Application</h1>
      {isLoading ? null : isAuthenticated ? (
        <>
          <Link to="/dashboard" className="underline">
            Go to Dashboard
          </Link>
          <LogoutButton />
        </>
      ) : (
        <Link to="/login" className="underline">
          Log In
        </Link>
      )}
    </div>
  )
}
