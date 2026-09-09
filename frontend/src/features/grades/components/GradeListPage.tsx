import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePermissions } from '@/features/auth/hooks'

import { GradeFormDialog } from './GradeFormDialog'
import { useDeleteGrade, useGrades } from '../hooks'
import type { Grade } from '../types'

// Grades tend to be few per company, so this is a simple list rather than a paginated data
// table — same convention as features/positions/components/PositionListPage.tsx. Grades and
// Positions are managed by the same people, so this reuses canManagePositions rather than
// introducing a separate canManageGrades permission.
export function GradeListPage() {
  const [dialogState, setDialogState] = useState<
    { mode: 'create' } | { mode: 'edit'; grade: Grade } | null
  >(null)
  const [deleteTarget, setDeleteTarget] = useState<Grade | null>(null)

  const { canManagePositions } = usePermissions()
  const { data: grades, isLoading, isError } = useGrades()
  const deleteGrade = useDeleteGrade()

  const columnCount = canManagePositions ? 4 : 3

  function confirmDelete() {
    if (deleteTarget) {
      // The backend rejects this with 409 GRADE_IN_USE if any positions still use this
      // grade (grade_service.delete_grade), surfaced here as a toast — no separate
      // pre-check query needed, same pattern as PositionListPage's delete confirmation.
      deleteGrade.mutate(deleteTarget.code)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Grades</h1>
        {canManagePositions && (
          <Button type="button" onClick={() => setDialogState({ mode: 'create' })}>
            <Plus />
            New Grade
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Level</TableHead>
              {canManagePositions && <TableHead className="w-24 text-right">Actions</TableHead>}
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
                  Failed to load grades.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && grades?.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  No grades yet.
                </TableCell>
              </TableRow>
            )}
            {grades?.map((grade) => (
              <TableRow key={grade.code}>
                <TableCell className="font-medium">{grade.code}</TableCell>
                <TableCell>{grade.name}</TableCell>
                <TableCell>{grade.level}</TableCell>
                {canManagePositions && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${grade.name}`}
                        onClick={() => setDialogState({ mode: 'edit', grade })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${grade.name}`}
                        onClick={() => setDeleteTarget(grade)}
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

      {dialogState && (
        <GradeFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogState(null)
          }}
          mode={dialogState.mode}
          grade={dialogState.mode === 'edit' ? dialogState.grade : undefined}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete grade?"
        description={
          deleteTarget
            ? `This will permanently delete "${deleteTarget.name}". This action cannot be undone. If any positions still use this grade, the deletion will be blocked.`
            : ''
        }
        onConfirm={confirmDelete}
        isPending={deleteGrade.isPending}
      />
    </div>
  )
}
