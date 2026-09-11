import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { useMyPermissions } from '../hooks'
import { ProtectedRoute } from './ProtectedRoute'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

// requiredPermission is checked against useMyPermissions() (the caller's own Position
// permission, from the backend) now, not a role claim — see ProtectedRoute.tsx and
// features/auth/hooks.ts. Only that one export is mocked; useAuth0 still drives plain
// isAuthenticated/isLoading.
vi.mock('../hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks')>()
  return { ...actual, useMyPermissions: vi.fn() }
})

function mockAuthenticated() {
  vi.mocked(useAuth0).mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
  } as unknown as ReturnType<typeof useAuth0>)
}

function mockCanManageEmployees(canManageEmployees: boolean) {
  vi.mocked(useMyPermissions).mockReturnValue({
    data: {
      role: '',
      manage_employees: canManageEmployees,
      manage_products: false,
      manage_positions: false,
      view_salary: false,
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useMyPermissions>)
}

function renderEmployeesRoute() {
  render(
    <MemoryRouter initialEntries={['/employees']}>
      <Routes>
        <Route element={<ProtectedRoute requiredPermission="manage_employees" />}>
          <Route path="/employees" element={<div>Employees Page</div>} />
        </Route>
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute requiredPermission', () => {
  it('renders the route when the caller has the required Position permission', () => {
    mockAuthenticated()
    mockCanManageEmployees(true)
    renderEmployeesRoute()
    expect(screen.getByText('Employees Page')).toBeInTheDocument()
  })

  it('shows Access denied instead of the route when the caller lacks the permission', () => {
    mockAuthenticated()
    mockCanManageEmployees(false)
    renderEmployeesRoute()
    expect(screen.queryByText('Employees Page')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument()
  })

  it('lets the user navigate back to the dashboard from the Access denied page', () => {
    mockAuthenticated()
    mockCanManageEmployees(false)
    renderEmployeesRoute()
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })

  it('shows a loading state instead of Access denied while permissions are still loading', () => {
    mockAuthenticated()
    vi.mocked(useMyPermissions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useMyPermissions>)
    renderEmployeesRoute()
    expect(screen.queryByText('Employees Page')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /access denied/i })).not.toBeInTheDocument()
  })

  it('redirects to /login when not authenticated at all, ignoring requiredPermission', () => {
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as unknown as ReturnType<typeof useAuth0>)
    mockCanManageEmployees(false)

    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Routes>
          <Route element={<ProtectedRoute requiredPermission="manage_employees" />}>
            <Route path="/employees" element={<div>Employees Page</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })
})
