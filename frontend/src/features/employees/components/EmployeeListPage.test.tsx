import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmployeeListPage } from './EmployeeListPage'
import { useDeleteEmployee, useEmployees, usePositions } from '../hooks'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

vi.mock('../hooks', () => ({
  useEmployees: vi.fn(),
  usePositions: vi.fn(),
  useDeleteEmployee: vi.fn(),
}))

const ROLE_CLAIM = 'https://localmanagementapp.com/role'

function mockRole(role: string | undefined) {
  vi.mocked(useAuth0).mockReturnValue({
    user: role ? { [ROLE_CLAIM]: role } : undefined,
  } as ReturnType<typeof useAuth0>)
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
  it('shows New/Edit/Delete and the Salary column for admin', () => {
    mockRole('admin')
    render(<EmployeeListPage />)
    expect(screen.getByRole('button', { name: /new employee/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit jane doe/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete jane doe/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /salary/i })).toBeInTheDocument()
    expect(screen.getByText('$75,000.50')).toBeInTheDocument()
  })

  it('shows New/Edit/Delete and the Salary column for hr_manager', () => {
    mockRole('hr_manager')
    render(<EmployeeListPage />)
    expect(screen.getByRole('button', { name: /new employee/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit jane doe/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete jane doe/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /salary/i })).toBeInTheDocument()
    expect(screen.getByText('$75,000.50')).toBeInTheDocument()
  })

  it('hides New/Edit/Delete and the Salary column for inventory_manager (wrong department)', () => {
    mockRole('inventory_manager')
    render(<EmployeeListPage />)
    expect(screen.queryByRole('button', { name: /new employee/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /salary/i })).not.toBeInTheDocument()
    expect(screen.queryByText('$75,000.50')).not.toBeInTheDocument()
  })

  it('hides New/Edit/Delete and the Salary column for employee (read-only)', () => {
    mockRole('employee')
    render(<EmployeeListPage />)
    expect(screen.queryByRole('button', { name: /new employee/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /salary/i })).not.toBeInTheDocument()
    expect(screen.queryByText('$75,000.50')).not.toBeInTheDocument()
    // the non-sensitive data itself is still visible — read-only, not hidden entirely
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('fails closed and hides New/Edit/Delete and Salary when the role claim is missing', () => {
    mockRole(undefined)
    render(<EmployeeListPage />)
    expect(screen.queryByRole('button', { name: /new employee/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete jane doe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /salary/i })).not.toBeInTheDocument()
    expect(screen.queryByText('$75,000.50')).not.toBeInTheDocument()
  })

  it('renders a clean error state instead of crashing when the query fails (e.g. a super_admin token, which has no company_id and gets a 403 from the backend)', () => {
    mockRole('super_admin')
    vi.mocked(useEmployees).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useEmployees>)
    render(<EmployeeListPage />)
    expect(screen.getByText(/failed to load employees/i)).toBeInTheDocument()
    // super_admin isn't admin/hr_manager, so New/Edit/Delete correctly stay hidden too
    expect(screen.queryByRole('button', { name: /new employee/i })).not.toBeInTheDocument()
  })
})
