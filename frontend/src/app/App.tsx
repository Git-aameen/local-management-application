import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { ErrorDialog } from '@/components/ui/error-dialog'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/components/LoginPage'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { CompanyListPage } from '@/features/companies/components/CompanyListPage'
import { EmployeeListPage } from '@/features/employees/components/EmployeeListPage'
import { PositionListPage } from '@/features/positions/components/PositionListPage'
import { ProductListPage } from '@/features/products/components/ProductListPage'
import { queryClient } from '@/lib/queryClient'

import { DashboardPage } from './DashboardPage'
import { HomePage } from './HomePage'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/companies" element={<CompanyListPage />} />
                <Route path="/employees" element={<EmployeeListPage />} />
                <Route path="/positions" element={<PositionListPage />} />
                <Route path="/products" element={<ProductListPage />} />
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
