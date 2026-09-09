import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { LoginPage } from './LoginPage'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

function renderLoginPage() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('calls loginWithPopup and navigates to the post-login destination on success', async () => {
    const authState: { isAuthenticated: boolean; user: unknown } = {
      isAuthenticated: false,
      user: undefined,
    }
    const loginWithPopup = vi.fn().mockImplementation(async () => {
      authState.isAuthenticated = true
      authState.user = { 'https://localmanagementapp.com/role': 'admin' }
    })
    vi.mocked(useAuth0).mockImplementation(
      () =>
        ({
          isLoading: false,
          isAuthenticated: authState.isAuthenticated,
          user: authState.user,
          loginWithPopup,
          loginWithRedirect: vi.fn(),
        }) as unknown as ReturnType<typeof useAuth0>,
    )

    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(loginWithPopup).toHaveBeenCalled()
    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument()
  })

  it('shows a fallback with a redirect option when the popup fails to open', async () => {
    const loginWithRedirect = vi.fn()
    vi.mocked(useAuth0).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      user: undefined,
      loginWithPopup: vi.fn().mockRejectedValue(new Error('Unable to open a popup')),
      loginWithRedirect,
    } as unknown as ReturnType<typeof useAuth0>)

    const user = userEvent.setup()
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't open the login popup/i)
    await user.click(screen.getByRole('button', { name: /continue without a popup/i }))
    expect(loginWithRedirect).toHaveBeenCalled()
  })
})
