import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import { SimplePagination } from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePermissions } from '@/features/auth/hooks'
import { formatCurrency } from '@/lib/formatters'

import { EmployeeFormDialog } from './EmployeeFormDialog'
import { useDeleteEmployee, useEmployees, usePositions } from '../hooks'
import type { Employee } from '../types'

const PAGE_SIZE = 10

export function EmployeeListPage() {
  const [page, setPage] = useState(1)
  const [dialogState, setDialogState] = useState<
    { mode: 'create' } | { mode: 'edit'; employee: Employee } | null
  >(null)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)

  const { canManageEmployees, canViewSalary } = usePermissions()
  const { data, isLoading, isError } = useEmployees(page, PAGE_SIZE)
  const { data: positions } = usePositions()
  const deleteEmployee = useDeleteEmployee()

  const positionNameById = new Map((positions ?? []).map((p) => [p.id, p.name]))
  const columnCount = 4 + (canViewSalary ? 1 : 0) + (canManageEmployees ? 1 : 0)

  function confirmDelete() {
    if (deleteTarget) {
      deleteEmployee.mutate(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Employees</h1>
        {canManageEmployees && (
          <Button type="button" onClick={() => setDialogState({ mode: 'create' })}>
            <Plus />
            New Employee
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Hired At</TableHead>
              {canViewSalary && <TableHead>Salary</TableHead>}
              {canManageEmployees && <TableHead className="w-24 text-right">Actions</TableHead>}
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
                  Failed to load employees.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  No employees yet.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium">{employee.full_name}</TableCell>
                <TableCell>{positionNameById.get(employee.position_id) ?? '—'}</TableCell>
                <TableCell>{employee.email}</TableCell>
                <TableCell>{employee.hired_at}</TableCell>
                {canViewSalary && <TableCell>{formatCurrency(employee.salary)}</TableCell>}
                {canManageEmployees && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${employee.full_name}`}
                        onClick={() => setDialogState({ mode: 'edit', employee })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${employee.full_name}`}
                        onClick={() => setDeleteTarget(employee)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SimplePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />

      {dialogState && (
        <EmployeeFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogState(null)
          }}
          mode={dialogState.mode}
          employee={dialogState.mode === 'edit' ? dialogState.employee : undefined}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete employee?"
        description={
          deleteTarget
            ? `This will permanently delete ${deleteTarget.full_name}. This action cannot be undone.`
            : ''
        }
        onConfirm={confirmDelete}
        isPending={deleteEmployee.isPending}
      />
    </div>
  )
}
