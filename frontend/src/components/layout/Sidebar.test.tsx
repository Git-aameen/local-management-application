import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { Sidebar } from './Sidebar'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

const ROLE_CLAIM = 'https://localmanagementapp.com/role'

function mockRole(role: string | undefined) {
  vi.mocked(useAuth0).mockReturnValue({
    user: role ? { [ROLE_CLAIM]: role } : undefined,
  } as ReturnType<typeof useAuth0>)
}

function renderSidebar() {
  render(
    <MemoryRouter>
      <Sidebar collapsed={false} onToggle={() => {}} />
    </MemoryRouter>,
  )
}

describe('Sidebar Companies link visibility', () => {
  it('shows Companies for super_admin', () => {
    mockRole('super_admin')
    renderSidebar()
    expect(screen.getByRole('link', { name: /companies/i })).toBeInTheDocument()
  })

  it('hides Companies for a regular tenant admin', () => {
    mockRole('admin')
    renderSidebar()
    expect(screen.queryByRole('link', { name: /companies/i })).not.toBeInTheDocument()
  })

  it('hides Companies for hr_manager, inventory_manager, and employee', () => {
    for (const role of ['hr_manager', 'inventory_manager', 'employee']) {
      mockRole(role)
      const { unmount } = render(
        <MemoryRouter>
          <Sidebar collapsed={false} onToggle={() => {}} />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('link', { name: /companies/i })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('always shows Dashboard/Employees/Positions/Products regardless of role', () => {
    mockRole('super_admin')
    renderSidebar()
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /employees/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /positions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /products/i })).toBeInTheDocument()
  })
})
