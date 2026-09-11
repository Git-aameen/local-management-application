import { Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DetailRow } from '@/components/ui/detail-row'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { Position } from '../types'

const PERMISSION_LABELS: Array<{ key: keyof Position; label: string }> = [
  { key: 'manage_employees', label: 'Manage employees' },
  { key: 'manage_products', label: 'Manage products' },
  { key: 'manage_positions', label: 'Manage positions' },
  { key: 'view_salary', label: 'View salary' },
  { key: 'manage_special_permissions', label: 'Manage special permissions' },
]

interface PositionDetailDialogProps {
  position: Position | null
  canManagePositions: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

// Read-only "show me this record" modal, opened by clicking a PositionListPage card (see
// ARCHITECTURE.md § 6) — Edit/Delete call back into the same PositionFormDialog/
// ConfirmDeleteDialog the card's own icon buttons use.
export function PositionDetailDialog({
  position,
  canManagePositions,
  onOpenChange,
  onEdit,
  onDelete,
}: PositionDetailDialogProps) {
  return (
    <Dialog open={position !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {position && (
          <>
            <DialogHeader>
              <DialogTitle>{position.name}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col">
              <DetailRow label="Created At">
                {new Date(position.created_at).toLocaleDateString()}
              </DetailRow>
              {PERMISSION_LABELS.map(({ key, label }) => (
                <DetailRow key={key} label={label}>
                  {position[key] ? 'Yes' : 'No'}
                </DetailRow>
              ))}
            </div>

            {canManagePositions && (
              <DialogFooter>
                <Button type="button" variant="outline" elevated onClick={onEdit}>
                  <Pencil />
                  Edit
                </Button>
                <Button type="button" variant="destructive" elevated onClick={onDelete}>
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
