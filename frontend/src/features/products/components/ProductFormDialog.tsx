import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { Product } from '../types'
import { useCreateProduct, useUpdateProduct } from '../hooks'

const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  category: z.string().trim().min(1, 'Category is required'),
  // Enforced client-side for instant feedback; the backend also rejects a negative
  // quantity (Field(ge=0) on ProductCreate/ProductUpdate) as a defense-in-depth check.
  quantity: z.number().int('Quantity must be a whole number').min(0, 'Quantity cannot be negative'),
  price: z.number().positive('Price must be greater than 0'),
})

type ProductFormValues = z.infer<typeof productSchema>

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  product?: Product
}

export function ProductFormDialog({ open, onOpenChange, mode, product }: ProductFormDialogProps) {
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    values:
      mode === 'edit' && product
        ? {
            name: product.name,
            category: product.category,
            quantity: product.quantity,
            price: Number(product.price),
          }
        : { name: '', category: '', quantity: 0, price: 0 },
  })

  async function onSubmit(values: ProductFormValues) {
    try {
      if (mode === 'create') {
        await createProduct.mutateAsync(values)
      } else if (product) {
        await updateProduct.mutateAsync({ id: product.id, input: values })
      }
      onOpenChange(false)
      reset()
    } catch {
      // The mutation's onError already surfaced a toast — keep the dialog open so the
      // user can fix their input and resubmit.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New Product' : 'Edit Product'}</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <Input id="category" {...register('category')} aria-invalid={!!errors.category} />
            {errors.category && (
              <p className="text-sm text-destructive">{errors.category.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              step="1"
              min="0"
              {...register('quantity', { valueAsNumber: true })}
              aria-invalid={!!errors.quantity}
            />
            {errors.quantity && (
              <p className="text-sm text-destructive">{errors.quantity.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              {...register('price', { valueAsNumber: true })}
              aria-invalid={!!errors.price}
            />
            {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
