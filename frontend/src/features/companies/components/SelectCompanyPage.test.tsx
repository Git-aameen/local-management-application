import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { SelectCompanyPage } from './SelectCompanyPage'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

vi.mock('../hooks', () => ({
  useCompanies: () => ({
    data: [
      { id: 1, name: 'Acme Corp', created_at: '2024-01-01T00:00:00Z' },
      { id: 2, name: 'Globex', created_at: '2024-01-02T00:00:00Z' },
    ],
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/lib/actingCompany', () => ({
  setActingCompanyId: vi.fn(),
  useActingCompanyId: () => null,
}))

const ROLE_CLAIM = 'https://localmanagementapp.com/role'

function mockRole(role: string) {
  vi.mocked(useAuth0).mockReturnValue({
    user: { [ROLE_CLAIM]: role, email: 'super@example.com' },
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth0>)
}

function mockNoRoleClaim() {
  // A real tenant user's token carries no role claim at all now (see CLAUDE.md §
  // Authentication & Authorization) — usePermissions().role is null for them, never some
  // other non-null, non-super_admin string.
  vi.mocked(useAuth0).mockReturnValue({
    user: { email: 'tenant@example.com' },
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuth0>)
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/select-company']}>
      <Routes>
        <Route path="/select-company" element={<SelectCompanyPage />} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SelectCompanyPage', () => {
  it('lists every company from the super_admin-only companies endpoint', () => {
    mockRole('super_admin')
    renderPage()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('Globex')).toBeInTheDocument()
  })

  it('selecting a company sets acting mode and navigates to the dashboard', async () => {
    mockRole('super_admin')
    const { setActingCompanyId } = await import('@/lib/actingCompany')
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getAllByRole('button', { name: /select/i })[0])

    expect(setActingCompanyId).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument()
  })

  it('bounces a non-super_admin straight to the dashboard instead of showing the gate', () => {
    mockRole('admin')
    renderPage()
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
    expect(screen.queryByText('Select a Company')).not.toBeInTheDocument()
  })

  it('bounces a tenant user with no role claim at all straight to the dashboard too', () => {
    mockNoRoleClaim()
    renderPage()
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument()
    expect(screen.queryByText('Select a Company')).not.toBeInTheDocument()
  })
})
