import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import { Card } from '@/components/ui/card'
import { SimplePagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMyPermissions } from '@/features/auth/hooks'

import { ProductDetailDialog } from './ProductDetailDialog'
import { ProductFormDialog } from './ProductFormDialog'
import { useDeleteProduct, useProductCategories, useProducts } from '../hooks'
import type { Product } from '../types'

const PAGE_SIZE = 10
const LOW_STOCK_THRESHOLD = 10
const ALL_CATEGORIES = '__all__'

export function ProductListPage() {
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [dialogState, setDialogState] = useState<
    { mode: 'create' } | { mode: 'edit'; product: Product } | null
  >(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [detailTarget, setDetailTarget] = useState<Product | null>(null)

  // canManageProducts comes from the backend (see useMyPermissions), not a plain JWT-role
  // check — it must reflect the OR logic with the caller's own Position (or permission
  // override) grant (an `employee` whose own Position or override record has
  // manage_products=true can manage Products too, same as admin/inventory_manager), which
  // the frontend has no other way to know (CLAUDE.md § Authentication & Authorization).
  // Defaults to false while loading — fail closed, never show manage controls before we're
  // sure they're allowed.
  const { data: myPermissions } = useMyPermissions()
  const canManageProducts = myPermissions?.manage_products ?? false
  const { data, isLoading, isError } = useProducts(page, PAGE_SIZE, category)
  const { data: categories } = useProductCategories()
  const deleteProduct = useDeleteProduct()

  function handleCategoryChange(value: string) {
    setCategory(value === ALL_CATEGORIES ? undefined : value)
    setPage(1)
  }

  function confirmDelete() {
    if (deleteTarget) {
      deleteProduct.mutate(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  function editFromCardOrDialog(product: Product) {
    setDetailTarget(null)
    setDialogState({ mode: 'edit', product })
  }

  function deleteFromCardOrDialog(product: Product) {
    setDetailTarget(null)
    setDeleteTarget(product)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-medium text-panel-foreground">Products</h1>
        {canManageProducts && (
          <Button type="button" onClick={() => setDialogState({ mode: 'create' })}>
            <Plus />
            New Product
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select value={category ?? ALL_CATEGORIES} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-center text-panel-foreground/70">Loading…</p>}
      {isError && <p className="text-center text-destructive-light">Failed to load products.</p>}
      {!isLoading && !isError && data?.items.length === 0 && (
        <p className="text-center text-panel-foreground/70">No products yet.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((product) => (
          <Card
            key={product.id}
            interactive
            role="button"
            tabIndex={0}
            aria-label={`View ${product.name}`}
            onClick={() => setDetailTarget(product)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setDetailTarget(product)
              }
            }}
            className="flex flex-col gap-2 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">{product.name}</span>
                <span className="text-sm text-muted-foreground">{product.category}</span>
              </div>
              {canManageProducts && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${product.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      editFromCardOrDialog(product)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${product.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteFromCardOrDialog(product)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Qty {product.quantity}</span>
              {product.quantity < LOW_STOCK_THRESHOLD && (
                <Badge variant="destructive">Low stock</Badge>
              )}
            </div>
            <span className="text-sm font-medium">${Number(product.price).toFixed(2)}</span>
          </Card>
        ))}
      </div>

      <SimplePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPageChange={setPage}
      />

      <ProductDetailDialog
        product={detailTarget}
        canManageProducts={canManageProducts}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null)
        }}
        onEdit={() => detailTarget && editFromCardOrDialog(detailTarget)}
        onDelete={() => detailTarget && deleteFromCardOrDialog(detailTarget)}
      />

      {dialogState && (
        <ProductFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogState(null)
          }}
          mode={dialogState.mode}
          product={dialogState.mode === 'edit' ? dialogState.product : undefined}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete product?"
        description={
          deleteTarget
            ? `This will permanently delete ${deleteTarget.name}. This action cannot be undone.`
            : ''
        }
        onConfirm={confirmDelete}
        isPending={deleteProduct.isPending}
      />
    </div>
  )
}
