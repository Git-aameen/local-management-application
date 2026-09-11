import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMyPermissions } from '@/features/auth/hooks'

import { ProductListPage } from './ProductListPage'
import { useDeleteProduct, useProductCategories, useProducts } from '../hooks'

// canManageProducts on this page comes entirely from useMyPermissions() (a real backend
// call — see the comment in ProductListPage.tsx and features/auth/hooks.ts), which has no
// meaning in a component test with no QueryClient/network, so that's the one export mocked
// here. ProductListPage doesn't call useAuth0/usePermissions directly at all — no need to
// mock @auth0/auth0-react in this file.
vi.mock('@/features/auth/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/hooks')>()
  return { ...actual, useMyPermissions: vi.fn() }
})

vi.mock('../hooks', () => ({
  useProducts: vi.fn(),
  useProductCategories: vi.fn(),
  useDeleteProduct: vi.fn(),
}))

function mockCanManageProducts(canManageProducts: boolean) {
  vi.mocked(useMyPermissions).mockReturnValue({
    data: {
      role: '',
      manage_employees: false,
      manage_products: canManageProducts,
      manage_positions: false,
      view_salary: false,
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useMyPermissions>)
}

beforeEach(() => {
  vi.mocked(useProducts).mockReturnValue({
    data: {
      items: [
        {
          id: 1,
          company_id: 1,
          name: 'Widget',
          category: 'Hardware',
          quantity: 42,
          price: '19.99',
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
  } as ReturnType<typeof useProducts>)
  vi.mocked(useProductCategories).mockReturnValue({
    data: ['Hardware'],
  } as ReturnType<typeof useProductCategories>)
  vi.mocked(useDeleteProduct).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteProduct>)
})

describe('ProductListPage role-based UI', () => {
  it('shows New/Edit/Delete when the backend reports manage_products (admin/inventory_manager)', () => {
    mockCanManageProducts(true)
    render(<ProductListPage />)
    expect(screen.getByRole('button', { name: /new product/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit widget/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete widget/i })).toBeInTheDocument()
  })

  it('hides New/Edit/Delete when the backend reports manage_products: false (e.g. hr_manager, or an employee with no grant)', () => {
    mockCanManageProducts(false)
    render(<ProductListPage />)
    expect(screen.queryByRole('button', { name: /new product/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit widget/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete widget/i })).not.toBeInTheDocument()
    // the data itself is still visible — read-only, not hidden entirely
    expect(screen.getByText('Widget')).toBeInTheDocument()
  })

  it('shows New/Edit/Delete for an employee whose Position/grant allows managing products, even though the "employee" role alone would not', () => {
    // The whole point of this feature: canManageProducts on this page is NOT a plain
    // role check — it's whatever GET /api/v1/me/permissions reports, which is additive
    // (Position allows it OR the employee's own permission-override record allows it —
    // see require_position_permission in app/core/dependencies.py). An `employee` whose
    // Position itself has manage_products=true gets the same controls an
    // admin/inventory_manager would.
    mockCanManageProducts(true)
    render(<ProductListPage />)
    expect(screen.getByRole('button', { name: /new product/i })).toBeInTheDocument()
  })

  it('fails closed (no manage controls) while permissions are still loading', () => {
    vi.mocked(useMyPermissions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useMyPermissions>)
    render(<ProductListPage />)
    expect(screen.queryByRole('button', { name: /new product/i })).not.toBeInTheDocument()
  })
})
