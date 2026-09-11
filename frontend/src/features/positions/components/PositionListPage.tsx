import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import { NeumorphicCard } from '@/components/ui/neumorphic-card'
import { useMyPermissions } from '@/features/auth/hooks'

import { PositionDetailDialog } from './PositionDetailDialog'
import { PositionFormDialog } from './PositionFormDialog'
import { useDeletePosition, usePositions } from '../hooks'
import type { Position } from '../types'

// Positions tend to be few per company, so this is a simple grid rather than a paginated
// data set (see features/positions/api.ts) — full pagination would be overkill here.
export function PositionListPage() {
  const [dialogState, setDialogState] = useState<
    { mode: 'create' } | { mode: 'edit'; position: Position } | null
  >(null)
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null)
  const [detailTarget, setDetailTarget] = useState<Position | null>(null)

  // The caller's own Position permission is the sole source of truth now (see
  // useMyPermissions), not a JWT role check. Defaults to false while loading — fail closed.
  const { data: myPermissions } = useMyPermissions()
  const canManagePositions = myPermissions?.manage_positions ?? false
  const { data: positions, isLoading, isError } = usePositions()
  const deletePosition = useDeletePosition()

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

  function editFromCardOrDialog(position: Position) {
    setDetailTarget(null)
    setDialogState({ mode: 'edit', position })
  }

  function deleteFromCardOrDialog(position: Position) {
    setDetailTarget(null)
    setDeleteTarget(position)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Positions</h1>
        {canManagePositions && (
          <Button type="button" elevated onClick={() => setDialogState({ mode: 'create' })}>
            <Plus />
            New Position
          </Button>
        )}
      </div>

      {isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
      {isError && <p className="text-center text-destructive">Failed to load positions.</p>}
      {!isLoading && !isError && positions?.length === 0 && (
        <p className="text-center text-muted-foreground">No positions yet.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {positions?.map((position) => (
          <NeumorphicCard
            key={position.id}
            interactive
            role="button"
            tabIndex={0}
            aria-label={`View ${position.name}`}
            onClick={() => setDetailTarget(position)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setDetailTarget(position)
              }
            }}
            className="flex flex-col gap-2 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">{position.name}</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(position.created_at).toLocaleDateString()}
                </span>
              </div>
              {canManagePositions && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${position.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      editFromCardOrDialog(position)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${position.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteFromCardOrDialog(position)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          </NeumorphicCard>
        ))}
      </div>

      <PositionDetailDialog
        position={detailTarget}
        canManagePositions={canManagePositions}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null)
        }}
        onEdit={() => detailTarget && editFromCardOrDialog(detailTarget)}
        onDelete={() => detailTarget && deleteFromCardOrDialog(detailTarget)}
      />

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
