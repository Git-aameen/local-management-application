import { useAuth0 } from '@auth0/auth0-react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { usePermissions } from '@/features/auth/hooks'
import { setActingCompanyId } from '@/lib/actingCompany'

import { useCompanies } from '../hooks'

// The mandatory full-screen gate a super_admin lands on before they can reach the normal
// app shell at all — see RequireActingCompanyForSuperAdmin.tsx, which is what actually
// enforces "no other route until a company is selected"; this component is just the screen
// that gate redirects to. Deliberately rendered OUTSIDE AppLayout (see App.tsx) — no
// Sidebar/Topbar — so it needs its own LogoutButton, unlike every other page.
//
// Reuses the same GET /api/v1/companies list the Companies management page uses, since that
// endpoint is already restricted to super_admin server-side (app/api/v1/companies.py).
// Picking a row is what puts the app into "act as company" mode: every subsequent API call
// carries X-Acting-Company-Id (see lib/actingCompany.ts and lib/apiClient.ts).
export function SelectCompanyPage() {
  const { user } = useAuth0()
  const { role } = usePermissions()
  const navigate = useNavigate()
  const { data: companies, isLoading, isError } = useCompanies()

  // Nothing here is relevant to a tenant user — this screen only exists for super_admin. A
  // stray direct visit (e.g. a typed URL) just bounces to /dashboard. Checking only
  // `!== 'super_admin'` (not also `role !== null`) matters now: a tenant user's token no
  // longer carries a role claim at all, so `role` is always null for them, never some other
  // non-null string the old check was looking for (see CLAUDE.md § Authentication &
  // Authorization) — the old two-part check would have silently stopped redirecting them.
  if (role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />
  }

  function selectCompany(companyId: number) {
    setActingCompanyId(companyId)
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-2xl font-medium">Select a Company</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {user?.email}. Choose a company to manage as its administrator.
        </p>
      </div>

      <div className="w-full max-w-lg rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-24 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-destructive">
                  Failed to load companies.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && companies?.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No companies yet.
                </TableCell>
              </TableRow>
            )}
            {companies?.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" size="sm" onClick={() => selectCompany(company.id)}>
                    Select
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <LogoutButton />
    </div>
  )
}
