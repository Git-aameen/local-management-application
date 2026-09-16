import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { App } from './App'

vi.mock('@auth0/auth0-react', () => ({
  Auth0Provider: ({ children }: { children: React.ReactNode }) => children,
  useAuth0: vi.fn(),
}))

describe('App', () => {
  it('redirects the root route to /login and shows a Log In button there', () => {
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      loginWithPopup: vi.fn(),
      loginWithRedirect: vi.fn(),
    } as unknown as ReturnType<typeof useAuth0>)

    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Local Management Application' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })
})
