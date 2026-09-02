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

import { PositionFormDialog } from './PositionFormDialog'
import { useDeletePosition, usePositions } from '../hooks'
import type { Position } from '../types'

// Positions tend to be few per company, so this is a simple list rather than a paginated
// data table (see features/positions/api.ts) — full pagination would be overkill here.
export function PositionListPage() {
  const [dialogState, setDialogState] = useState<
    { mode: 'create' } | { mode: 'edit'; position: Position } | null
  >(null)
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null)

  const { canManagePositions } = usePermissions()
  const { data: positions, isLoading, isError } = usePositions()
  const deletePosition = useDeletePosition()

  const columnCount = canManagePositions ? 3 : 2

  function confirmDelete() {
    if (deleteTarget) {
      // The backend rejects this with 409 POSITION_IN_USE if any employees are still
      // assigned to this position (position_service.delete_position), and that message
      // surfaces here as a toast via getApiErrorMessage — so no separate pre-check query
      // is needed just to warn the user; the rejection itself is the warning, and nothing
      // is deleted until the backend confirms it's safe.
      deletePosition.mutate(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Positions</h1>
        {canManagePositions && (
          <Button type="button" onClick={() => setDialogState({ mode: 'create' })}>
            <Plus />
            New Position
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Created At</TableHead>
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
                  Failed to load positions.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && positions?.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  No positions yet.
                </TableCell>
              </TableRow>
            )}
            {positions?.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="font-medium">{position.name}</TableCell>
                <TableCell>{new Date(position.created_at).toLocaleDateString()}</TableCell>
                {canManagePositions && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${position.name}`}
                        onClick={() => setDialogState({ mode: 'edit', position })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${position.name}`}
                        onClick={() => setDeleteTarget(position)}
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
        <PositionFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogState(null)
          }}
          mode={dialogState.mode}
          position={dialogState.mode === 'edit' ? dialogState.position : undefined}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete position?"
        description={
          deleteTarget
            ? `This will permanently delete "${deleteTarget.name}". This action cannot be undone. If any employees are still assigned to it, the deletion will be blocked.`
            : ''
        }
        onConfirm={confirmDelete}
        isPending={deletePosition.isPending}
      />
    </div>
  )
}
