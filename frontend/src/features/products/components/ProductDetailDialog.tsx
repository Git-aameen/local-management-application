import { Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DetailRow } from '@/components/ui/detail-row'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { Product } from '../types'

const LOW_STOCK_THRESHOLD = 10

interface ProductDetailDialogProps {
  product: Product | null
  canManageProducts: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

// Read-only "show me this record" modal, opened by clicking a ProductListPage card (see
// ARCHITECTURE.md § 6) — Edit/Delete call back into the same ProductFormDialog/
// ConfirmDeleteDialog the card's own icon buttons use.
export function ProductDetailDialog({
  product,
  canManageProducts,
  onOpenChange,
  onEdit,
  onDelete,
}: ProductDetailDialogProps) {
  return (
    <Dialog open={product !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {product && (
          <>
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col">
              <DetailRow label="Category">{product.category}</DetailRow>
              <DetailRow label="Quantity">
                <span className="flex items-center gap-2">
                  {product.quantity}
                  {product.quantity < LOW_STOCK_THRESHOLD && (
                    <Badge variant="destructive" className="neu-raised-sm">
                      Low stock
                    </Badge>
                  )}
                </span>
              </DetailRow>
              <DetailRow label="Price">${Number(product.price).toFixed(2)}</DetailRow>
            </div>

            {canManageProducts && (
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
