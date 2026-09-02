import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import { SimplePagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePermissions } from '@/features/auth/hooks'

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

  const { canManageProducts } = usePermissions()
  const { data, isLoading, isError } = useProducts(page, PAGE_SIZE, category)
  const { data: categories } = useProductCategories()
  const deleteProduct = useDeleteProduct()

  const columnCount = canManageProducts ? 5 : 4

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Products</h1>
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Price</TableHead>
              {canManageProducts && <TableHead className="w-24 text-right">Actions</TableHead>}
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
                  Failed to load products.
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  No products yet.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.category}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{product.quantity}</span>
                    {product.quantity < LOW_STOCK_THRESHOLD && (
                      <Badge variant="destructive">Low stock</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>${Number(product.price).toFixed(2)}</TableCell>
                {canManageProducts && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${product.name}`}
                        onClick={() => setDialogState({ mode: 'edit', product })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${product.name}`}
                        onClick={() => setDeleteTarget(product)}
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
