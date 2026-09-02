import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePermissions } from '@/features/auth/hooks'

import { CompanyFormDialog } from './CompanyFormDialog'
import { useCompanies } from '../hooks'
import type { Company } from '../types'

// Companies (tenants) are few in practice, so this is a simple list rather than a paginated
// data table — same call as Positions (see features/positions/components/PositionListPage.tsx).
//
// Deliberately no delete action: deleting a company would cascade-affect all of its
// employees/products/positions (FK-linked to it), which is too risky to expose in the UI
// yet. This is a conscious omission, not an oversight.
export function CompanyListPage() {
  const [dialogState, setDialogState] = useState<
    { mode: 'create' } | { mode: 'edit'; company: Company } | null
  >(null)

  const { canManageCompanies } = usePermissions()
  const { data: companies, isLoading, isError } = useCompanies()

  const columnCount = canManageCompanies ? 3 : 2

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Companies</h1>
        {canManageCompanies && (
          <Button type="button" onClick={() => setDialogState({ mode: 'create' })}>
            <Plus />
            New Company
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Created At</TableHead>
              {canManageCompanies && <TableHead className="w-16 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-destructive">
                  Failed to load companies.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && companies?.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  No companies yet.
                </TableCell>
              </TableRow>
            )}
            {companies?.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell>{new Date(company.created_at).toLocaleDateString()}</TableCell>
                {canManageCompanies && (
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${company.name}`}
                      onClick={() => setDialogState({ mode: 'edit', company })}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {dialogState && (
        <CompanyFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogState(null)
          }}
          mode={dialogState.mode}
          company={dialogState.mode === 'edit' ? dialogState.company : undefined}
        />
      )}
    </div>
  )
}
