import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import { NeumorphicCard } from '@/components/ui/neumorphic-card'
import { SimplePagination } from '@/components/ui/pagination'
import { useMyPermissions } from '@/features/auth/hooks'
import { formatCurrency } from '@/lib/formatters'

import { EmployeeDetailDialog } from './EmployeeDetailDialog'
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
  const [detailTarget, setDetailTarget] = useState<Employee | null>(null)

  // Both come from the backend (see useMyPermissions) — the caller's own Position
  // permissions are the sole source of truth for manage access and salary visibility alike
  // now (CLAUDE.md § Authentication & Authorization), not a JWT role check. Default to
  // false while loading — fail closed, never show a manage control or salary before we're
  // sure it's allowed.
  const { data: myPermissions } = useMyPermissions()
  const canManageEmployees = myPermissions?.manage_employees ?? false
  const canViewSalary = myPermissions?.view_salary ?? false
  const { data, isLoading, isError } = useEmployees(page, PAGE_SIZE)
  const { data: positions } = usePositions()
  const deleteEmployee = useDeleteEmployee()

  const positionNameById = new Map((positions ?? []).map((p) => [p.id, p.name]))

  function confirmDelete() {
    if (deleteTarget) {
      deleteEmployee.mutate(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  function editFromCardOrDialog(employee: Employee) {
    setDetailTarget(null)
    setDialogState({ mode: 'edit', employee })
  }

  function deleteFromCardOrDialog(employee: Employee) {
    setDetailTarget(null)
    setDeleteTarget(employee)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Employees</h1>
        {canManageEmployees && (
          <Button type="button" elevated onClick={() => setDialogState({ mode: 'create' })}>
            <Plus />
            New Employee
          </Button>
        )}
      </div>

      {isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
      {isError && <p className="text-center text-destructive">Failed to load employees.</p>}
      {!isLoading && !isError && data?.items.length === 0 && (
        <p className="text-center text-muted-foreground">No employees yet.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((employee) => (
          <NeumorphicCard
            key={employee.id}
            interactive
            role="button"
            tabIndex={0}
            aria-label={`View ${employee.full_name}`}
            onClick={() => setDetailTarget(employee)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setDetailTarget(employee)
              }
            }}
            className="flex flex-col gap-2 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">{employee.full_name}</span>
                <span className="text-sm text-muted-foreground">
                  {positionNameById.get(employee.position_id) ?? '—'}
                </span>
              </div>
              {canManageEmployees && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${employee.full_name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      editFromCardOrDialog(employee)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${employee.full_name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteFromCardOrDialog(employee)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
            <span className="text-sm text-muted-foreground">{employee.email}</span>
            <span className="text-sm text-muted-foreground">Hired {employee.hired_at}</span>
            {canViewSalary && (
              <span className="text-sm font-medium">{formatCurrency(employee.salary)}</span>
            )}
          </NeumorphicCard>
        ))}
      </div>

      <SimplePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />

      <EmployeeDetailDialog
        employee={detailTarget}
        positionName={
          detailTarget ? (positionNameById.get(detailTarget.position_id) ?? '—') : ''
        }
        canManageEmployees={canManageEmployees}
        canViewSalary={canViewSalary}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null)
        }}
        onEdit={() => detailTarget && editFromCardOrDialog(detailTarget)}
        onDelete={() => detailTarget && deleteFromCardOrDialog(detailTarget)}
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
