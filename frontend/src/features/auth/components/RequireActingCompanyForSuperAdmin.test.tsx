import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { RequireActingCompanyForSuperAdmin } from './RequireActingCompanyForSuperAdmin'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

let mockActingCompanyId: number | null = null
vi.mock('@/lib/actingCompany', () => ({
  useActingCompanyId: () => mockActingCompanyId,
  setActingCompanyId: vi.fn(),
}))

const ROLE_CLAIM = 'https://localmanagementapp.com/role'

function mockRole(role: string) {
  vi.mocked(useAuth0).mockReturnValue({
    user: { [ROLE_CLAIM]: role },
  } as unknown as ReturnType<typeof useAuth0>)
}

function renderGuard() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/select-company" element={<div>Select Company Gate</div>} />
        <Route element={<RequireActingCompanyForSuperAdmin />}>
          <Route path="/dashboard" element={<div>Protected Shell Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireActingCompanyForSuperAdmin', () => {
  it('redirects a super_admin with no acting company to /select-company', () => {
    mockRole('super_admin')
    mockActingCompanyId = null
    renderGuard()
    expect(screen.getByText('Select Company Gate')).toBeInTheDocument()
    expect(screen.queryByText('Protected Shell Content')).not.toBeInTheDocument()
  })

  it('lets a super_admin who has selected a company through to the shell', () => {
    mockRole('super_admin')
    mockActingCompanyId = 1
    renderGuard()
    expect(screen.getByText('Protected Shell Content')).toBeInTheDocument()
  })

  it('never blocks a real tenant role, regardless of acting-company state', () => {
    mockRole('admin')
    mockActingCompanyId = null
    renderGuard()
    expect(screen.getByText('Protected Shell Content')).toBeInTheDocument()
  })
})
