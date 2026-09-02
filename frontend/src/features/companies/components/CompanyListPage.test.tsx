import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CompanyListPage } from './CompanyListPage'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

vi.mock('../hooks', () => ({
  useCompanies: () => ({
    data: [{ id: 1, name: 'Acme Corp', created_at: '2024-01-01T00:00:00Z' }],
    isLoading: false,
    isError: false,
  }),
}))

const ROLE_CLAIM = 'https://localmanagementapp.com/role'

function mockRole(role: string | undefined) {
  vi.mocked(useAuth0).mockReturnValue({
    user: role ? { [ROLE_CLAIM]: role } : undefined,
  } as ReturnType<typeof useAuth0>)
}

describe('CompanyListPage role-based UI', () => {
  it('shows New/Edit for super_admin', () => {
    mockRole('super_admin')
    render(<CompanyListPage />)
    expect(screen.getByRole('button', { name: /new company/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit acme corp/i })).toBeInTheDocument()
  })

  it('hides New/Edit for a regular tenant admin (read-only)', () => {
    mockRole('admin')
    render(<CompanyListPage />)
    expect(screen.queryByRole('button', { name: /new company/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit acme corp/i })).not.toBeInTheDocument()
    // the data itself is still visible — read-only, not hidden entirely
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('never shows a delete action for anyone (deliberate omission)', () => {
    mockRole('super_admin')
    render(<CompanyListPage />)
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('fails closed and hides New/Edit when the role claim is missing', () => {
    mockRole(undefined)
    render(<CompanyListPage />)
    expect(screen.queryByRole('button', { name: /new company/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit acme corp/i })).not.toBeInTheDocument()
  })
})
