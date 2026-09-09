import { useAuth0 } from '@auth0/auth0-react'

import { usePermissions } from '@/features/auth/hooks'
import { useMyCompany } from '@/features/companies/hooks'
import { useMySummary } from '@/features/dashboard/hooks'

export function DashboardPage() {
  const { user } = useAuth0()
  const { role } = usePermissions()
  const { data: company, isLoading: isCompanyLoading, isError: isCompanyError } = useMyCompany()
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useMySummary()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-medium">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Logged in as {user?.email}</p>
        {role === 'super_admin' ? (
          <p className="text-sm text-muted-foreground">Platform Administrator</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isCompanyLoading && 'Loading your company…'}
            {isCompanyError && 'Could not load your company.'}
            {company && `Company: ${company.name}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Employees"
          value={summary?.employee_count}
          isLoading={isSummaryLoading}
          isError={isSummaryError}
        />
        <SummaryCard
          label="Positions"
          value={summary?.position_count}
          isLoading={isSummaryLoading}
          isError={isSummaryError}
        />
        <SummaryCard
          label="Products"
          value={summary?.product_count}
          isLoading={isSummaryLoading}
          isError={isSummaryError}
        />
      </div>
    </div>
  )
}

interface SummaryCardProps {
  label: string
  value: number | undefined
  isLoading: boolean
  isError: boolean
}

function SummaryCard({ label, value, isLoading, isError }: SummaryCardProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border p-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold">
        {isLoading ? '…' : isError ? '—' : value}
      </span>
    </div>
  )
}
