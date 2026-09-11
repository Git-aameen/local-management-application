import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMyPermissions } from '@/features/auth/hooks'

import { EmployeeListPage } from './EmployeeListPage'
import { useDeleteEmployee, useEmployees, usePositions } from '../hooks'

// EmployeeListPage no longer calls useAuth0/usePermissions at all — canManageEmployees and
// canViewSalary both come from useMyPermissions() (the caller's own Position
// permission, from the backend — see CLAUDE.md § Authentication & Authorization and
// features/auth/hooks.ts), which has no meaning in a component test with no
// QueryClient/network, so that's the one thing mocked here.
vi.mock('@/features/auth/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/hooks')>()
  return { ...actual, useMyPermissions: vi.fn() }
})

vi.mock('../hooks', () => ({
  useEmployees: vi.fn(),
  usePositions: vi.fn(),
  useDeleteEmployee: vi.fn(),
}))

function mockPermissions({
  canManageEmployees = false,
  canViewSalary = false,
}: {
  canManageEmployees?: boolean
  canViewSalary?: boolean
} = {}) {
  vi.mocked(useMyPermissions).mockReturnValue({
    data: {
      role: '',
      manage_employees: canManageEmployees,
      manage_products: false,
      manage_positions: false,
      view_salary: canViewSalary,
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useMyPermissions>)
}

beforeEach(() => {
  vi.mocked(useEmployees).mockReturnValue({
    data: {
      items: [
        {
          id: 1,
          company_id: 1,
          position_id: 1,
          full_name: 'Jane Doe',
          email: 'jane@example.com',
          hired_at: '2024-01-01',
          salary: '75000.50',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
    },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useEmployees>)
  vi.mocked(usePositions).mockReturnValue({
    data: [{ id: 1, company_id: 1, name: 'Engineer', created_at: '2024-01-01T00:00:00Z' }],
  } as ReturnType<typeof usePositions>)
  vi.mocked(useDeleteEmployee).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteEmployee>)
})

describe('EmployeeListPage role-based UI', () => {
  it('shows New/Edit/Delete and the Salary column when the backend grants both', () => {
    mockPermissions({ canManageEmployees: true, canViewSalary: true })
    render(<EmployeeListPage />)
    expect(screen.getByRole('button', { name: /new employee/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit jane doe/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete jane doe/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /salary/i })).toBeInTheDocument()
    expect(screen.getByText('$75,000.50')).toBeInTheDocument()
  })

  it('shows Salary but hides New/Edit/Delete when only view_salary is granted', () => {
    mockPermissions({ canManageEmployees: false, canViewSalary: true })
    render(<EmployeeListPage />)
    expect(screen.queryByRole('button', { name: /new employee/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete jane doe/i })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /salary/i })).toBeInTheDocument()
    expect(screen.getByText('$75,000.50')).toBeInTheDocument()
  })

  it('hides New/Edit/Delete and the Salary column when neither is granted (e.g. a plain "employee" with no Position grant)', () => {
    mockPermissions()
    render(<EmployeeListPage />)
    expect(screen.queryByRole('button', { name: /new employee/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /salary/i })).not.toBeInTheDocument()
    expect(screen.queryByText('$75,000.50')).not.toBeInTheDocument()
    // the non-sensitive data itself is still visible — read-only, not hidden entirely
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('shows New/Edit/Delete for a plain "employee" role whose Position grants manage_employees', () => {
    // The whole point of the Role-RBAC -> Position-permission consolidation: the role
    // itself is irrelevant here, only what useMyPermissions() reports matters.
    mockPermissions({ canManageEmployees: true })
    render(<EmployeeListPage />)
    expect(screen.getByRole('button', { name: /new employee/i })).toBeInTheDocument()
  })

  it('fails closed and hides New/Edit/Delete and Salary while permissions are still loading', () => {
    vi.mocked(useMyPermissions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useMyPermissions>)
    render(<EmployeeListPage />)
    expect(screen.queryByRole('button', { name: /new employee/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /salary/i })).not.toBeInTheDocument()
  })

  it('renders a clean error state instead of crashing when the query fails (e.g. a super_admin token, which has no company_id and gets a 403 from the backend)', () => {
    mockPermissions()
    vi.mocked(useEmployees).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useEmployees>)
    render(<EmployeeListPage />)
    expect(screen.getByText(/failed to load employees/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new employee/i })).not.toBeInTheDocument()
  })
})
