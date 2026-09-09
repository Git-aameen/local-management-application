import { useAuth0 } from '@auth0/auth0-react'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setActingCompanyId } from '@/lib/actingCompany'

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

describe('usePermissions', () => {
  it('admin can manage employees, positions, products, view salary, but not companies', () => {
    mockRole('admin')
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({
      role: 'admin',
      canManageEmployees: true,
      canManagePositions: true,
      canManageProducts: true,
      canViewSalary: true,
      canManageCompanies: false,
    })
  })

  it('hr_manager can manage employees and positions and view salary, but not products or companies', () => {
    mockRole('hr_manager')
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({
      role: 'hr_manager',
      canManageEmployees: true,
      canManagePositions: true,
      canManageProducts: false,
      canViewSalary: true,
      canManageCompanies: false,
    })
  })

  it('inventory_manager can manage products, but not employees, positions, salary, or companies', () => {
    mockRole('inventory_manager')
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({
      role: 'inventory_manager',
      canManageEmployees: false,
      canManagePositions: false,
      canManageProducts: true,
      canViewSalary: false,
      canManageCompanies: false,
    })
  })

  it('employee has read-only access everywhere and cannot view salary or manage companies', () => {
    mockRole('employee')
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({
      role: 'employee',
      canManageEmployees: false,
      canManagePositions: false,
      canManageProducts: false,
      canViewSalary: false,
      canManageCompanies: false,
    })
  })

  it('super_admin can manage companies only — none of the tenant-scoped permissions', () => {
    mockRole('super_admin')
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({
      role: 'super_admin',
      canManageEmployees: false,
      canManagePositions: false,
      canManageProducts: false,
      canViewSalary: false,
      canManageCompanies: true,
    })
  })

  it('fails closed (read-only, no companies) when the role claim is missing entirely', () => {
    mockRole(undefined)
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({
      role: null,
      canManageEmployees: false,
      canManagePositions: false,
      canManageProducts: false,
      canViewSalary: false,
      canManageCompanies: false,
    })
  })

  it('fails closed (read-only, no companies) when the role claim is an unrecognized string', () => {
    mockRole('root')
    const { result } = renderHook(() => usePermissions())
    expect(result.current).toEqual({
      role: null,
      canManageEmployees: false,
      canManagePositions: false,
      canManageProducts: false,
      canViewSalary: false,
      canManageCompanies: false,
    })
  })

  it('fails closed (read-only) when the role claim is a non-string value', () => {
    mockRole(123)
    const { result } = renderHook(() => usePermissions())
    expect(result.current.role).toBeNull()
    expect(result.current.canViewSalary).toBe(false)
    expect(result.current.canManageCompanies).toBe(false)
  })

  describe('acting as company mode', () => {
    afterEach(() => {
      setActingCompanyId(null)
    })

    it('grants a super_admin acting as a company the same permissions a real admin would have', () => {
      mockRole('super_admin')
      setActingCompanyId(1)
      const { result } = renderHook(() => usePermissions())
      expect(result.current).toEqual({
        role: 'super_admin',
        canManageEmployees: true,
        canManagePositions: true,
        canManageProducts: true,
        canViewSalary: true,
        // identity-based, never granted by acting mode
        canManageCompanies: true,
      })
    })

    it('does not grant tenant permissions to a super_admin with no company selected', () => {
      mockRole('super_admin')
      const { result } = renderHook(() => usePermissions())
      expect(result.current.canManageEmployees).toBe(false)
      expect(result.current.canManageProducts).toBe(false)
      expect(result.current.canManagePositions).toBe(false)
      expect(result.current.canViewSalary).toBe(false)
    })

    it('never grants extra permissions to a real tenant role, even if acting state is somehow set', () => {
      mockRole('employee')
      setActingCompanyId(1)
      const { result } = renderHook(() => usePermissions())
      expect(result.current).toEqual({
        role: 'employee',
        canManageEmployees: false,
        canManagePositions: false,
        canManageProducts: false,
        canViewSalary: false,
        canManageCompanies: false,
      })
    })
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
