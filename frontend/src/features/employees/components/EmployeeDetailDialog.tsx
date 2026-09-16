import { Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DetailRow } from '@/components/ui/detail-row'
import { formatCurrency } from '@/lib/formatters'

import type { Employee } from '../types'

interface EmployeeDetailDialogProps {
  employee: Employee | null
  positionName: string
  canManageEmployees: boolean
  canViewSalary: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

// Read-only "show me this record" modal, opened by clicking an EmployeeListPage card (see
// ARCHITECTURE.md § 6) — Edit/Delete here call straight back into the same
// EmployeeFormDialog/ConfirmDeleteDialog the card's own icon buttons use, so there is only
// ever one edit form and one delete confirmation in the whole page, not a duplicate per
// entry point.
export function EmployeeDetailDialog({
  employee,
  positionName,
  canManageEmployees,
  canViewSalary,
  onOpenChange,
  onEdit,
  onDelete,
}: EmployeeDetailDialogProps) {
  return (
    <Dialog open={employee !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {employee && (
          <>
            <DialogHeader>
              <DialogTitle>{employee.full_name}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col">
              <DetailRow label="Position">{positionName}</DetailRow>
              <DetailRow label="Email">{employee.email}</DetailRow>
              <DetailRow label="Hired At">{employee.hired_at}</DetailRow>
              {canViewSalary && (
                <DetailRow label="Salary">{formatCurrency(employee.salary)}</DetailRow>
              )}
            </div>

            {canManageEmployees && (
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onEdit}>
                  <Pencil />
                  Edit
                </Button>
                <Button type="button" variant="destructive" onClick={onDelete}>
                  <Trash2 />
                  Delete
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
