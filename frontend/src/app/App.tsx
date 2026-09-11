import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { ErrorDialog } from '@/components/ui/error-dialog'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/components/LoginPage'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { RequireActingCompanyForSuperAdmin } from '@/features/auth/components/RequireActingCompanyForSuperAdmin'
import { CompanyListPage } from '@/features/companies/components/CompanyListPage'
import { SelectCompanyPage } from '@/features/companies/components/SelectCompanyPage'
import { EmployeeListPage } from '@/features/employees/components/EmployeeListPage'
import { PositionListPage } from '@/features/positions/components/PositionListPage'
import { ProductListPage } from '@/features/products/components/ProductListPage'
import { queryClient } from '@/lib/queryClient'

import { DashboardPage } from './DashboardPage'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* "/" always sends the browser to "/login" — no separate landing page content,
                just a redirect, so the address bar ends up showing /login directly. */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            {/* LoginPage already redirects an already-authenticated visitor onward on its
                own (see its useAuth0().isAuthenticated check). */}
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              {/* Full-screen gate, deliberately OUTSIDE AppLayout — a super_admin who
                  hasn't picked a company sees ONLY this, no Sidebar/Topbar at all. */}
              <Route path="/select-company" element={<SelectCompanyPage />} />
              <Route element={<RequireActingCompanyForSuperAdmin />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/companies" element={<CompanyListPage />} />
                  <Route element={<ProtectedRoute requiredPermission="manage_employees" />}>
                    <Route path="/employees" element={<EmployeeListPage />} />
                  </Route>
                  <Route element={<ProtectedRoute requiredPermission="manage_positions" />}>
                    <Route path="/positions" element={<PositionListPage />} />
                  </Route>
                  <Route path="/products" element={<ProductListPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
        <ErrorDialog />
      </AuthProvider>
    </QueryClientProvider>
  )
}
