import { Navigate, Outlet } from 'react-router-dom'

import { usePermissions } from '@/features/auth/hooks'
import { useActingCompanyId } from '@/lib/actingCompany'

// Sits between ProtectedRoute and AppLayout in App.tsx, so it's the ONE choke point that
// decides whether the normal app shell (Sidebar/Topbar/Dashboard/Employees/Products/
// Positions/Companies) is reachable at all. A super_admin who hasn't picked a company via
// /select-company gets bounced back there — no dashboard, no other route, full stop — so
// the selection screen reads as a mandatory full-screen gate rather than a page you can
// route around. Every non-super_admin role is unaffected (actingCompanyId is only ever set
// via /select-company, which is itself super_admin-only — see SelectCompanyPage.tsx).
export function RequireActingCompanyForSuperAdmin() {
  const { role } = usePermissions()
  const actingCompanyId = useActingCompanyId()

  if (role === 'super_admin' && actingCompanyId === null) {
    return <Navigate to="/select-company" replace />
  }

  return <Outlet />
}
