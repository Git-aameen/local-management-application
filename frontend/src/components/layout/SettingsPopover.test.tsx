import { useAuth0 } from '@auth0/auth0-react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SettingsPopover } from './SettingsPopover'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

// Replaces the old always-visible Topbar email + LogoutButton (see Topbar.tsx) — this is
// now the one place email + sign-out live, behind the icon rail's gear button.
describe('SettingsPopover', () => {
  it('shows the current user email and calls logout() when Sign out is clicked, only after opening the popover', async () => {
    const logout = vi.fn()
    vi.mocked(useAuth0).mockReturnValue({
      user: { email: 'admin@acmecorporation.com' },
      logout,
    } as unknown as ReturnType<typeof useAuth0>)

    const user = userEvent.setup()
    render(<SettingsPopover collapsed={false} />)

    // Closed by default — email/Sign out aren't in the document until opened.
    expect(screen.queryByText('admin@acmecorporation.com')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /settings/i }))

    await waitFor(() => {
      expect(screen.getByText('admin@acmecorporation.com')).toBeInTheDocument()
    })
    const signOutButton = screen.getByRole('button', { name: /sign out/i })
    await user.click(signOutButton)

    expect(logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    })
  })

  // A super_admin has no Employee/Position record at all (see CLAUDE.md § Authentication &
  // Authorization) — email here comes straight from the Auth0 SDK session, not a backend
  // call, so it must render the same way regardless.
  it('renders the email for a super_admin with no Position/Employee record', async () => {
    vi.mocked(useAuth0).mockReturnValue({
      user: { email: 'platform-operator@example.com' },
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth0>)

    const user = userEvent.setup()
    render(<SettingsPopover collapsed={false} />)
    await user.click(screen.getByRole('button', { name: /settings/i }))

    await waitFor(() => {
      expect(screen.getByText('platform-operator@example.com')).toBeInTheDocument()
    })
  })

  it('stays reachable by its accessible name when collapsed, with no visible "Settings" label', async () => {
    vi.mocked(useAuth0).mockReturnValue({
      user: { email: 'admin@acmecorporation.com' },
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth0>)

    render(<SettingsPopover collapsed />)

    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })
})
