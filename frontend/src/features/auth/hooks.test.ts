import { useAuth0 } from '@auth0/auth0-react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { getPostLoginRedirectPath, usePermissions } from './hooks'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

const ROLE_CLAIM = 'https://localmanagementapp.com/role'

function mockRole(role: unknown) {
  vi.mocked(useAuth0).mockReturnValue({
    user: role === undefined ? undefined : { [ROLE_CLAIM]: role },
  } as ReturnType<typeof useAuth0>)
}

// usePermissions() is identity-only now (role + canManageCompanies) — every
// Employees/Positions/Products manage/access decision comes from the caller's own
// Position permissions via useMyPermissions() instead (see CLAUDE.md § Authentication
// & Authorization and features/auth/hooks.ts). That consolidation is covered by
// ProtectedRoute.test.tsx, Sidebar.test.tsx, EmployeeListPage.test.tsx, and
// ProductListPage.test.tsx (all of which mock useMyPermissions()), not here.
describe('usePermissions', () => {
  it('canManageCompanies is true only for super_admin', () => {
    mockRole('super_admin')
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({ role: 'super_admin', canManageCompanies: true })
  })

  it.each(['admin', 'hr_manager', 'inventory_manager', 'employee'] as const)(
    'canManageCompanies is false for %s',
    (role) => {
      mockRole(role)
      const { result } = renderHook(() => usePermissions())
      expect(result.current).toEqual({ role, canManageCompanies: false })
    },
  )

  it('fails closed (role null, canManageCompanies false) when the role claim is missing entirely', () => {
    mockRole(undefined)
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({ role: null, canManageCompanies: false })
  })

  it('fails closed when the role claim is an unrecognized string', () => {
    mockRole('root')
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({ role: null, canManageCompanies: false })
  })

  it('fails closed when the role claim is a non-string value', () => {
    mockRole(123)
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({ role: null, canManageCompanies: false })
  })
})

describe('getPostLoginRedirectPath', () => {
  it('sends super_admin to /select-company', () => {
    expect(getPostLoginRedirectPath('super_admin')).toBe('/select-company')
  })

  it.each(['admin', 'hr_manager', 'inventory_manager', 'employee', null] as const)(
    'sends %s straight to /dashboard',
    (role) => {
      expect(getPostLoginRedirectPath(role)).toBe('/dashboard')
    },
  )
})
