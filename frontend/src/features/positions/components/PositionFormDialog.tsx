import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

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

import { useCreatePosition, useUpdatePosition } from '../hooks'
import type { Position } from '../types'

const positionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
})

type PositionFormValues = z.infer<typeof positionSchema>

interface PositionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  position?: Position
}

export function PositionFormDialog({ open, onOpenChange, mode, position }: PositionFormDialogProps) {
  const createPosition = useCreatePosition()
  const updatePosition = useUpdatePosition()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PositionFormValues>({
    resolver: zodResolver(positionSchema),
    values: mode === 'edit' && position ? { name: position.name } : { name: '' },
  })

  async function onSubmit(values: PositionFormValues) {
    try {
      if (mode === 'create') {
        await createPosition.mutateAsync(values)
      } else if (position) {
        await updatePosition.mutateAsync({ id: position.id, input: values })
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
          <DialogTitle>{mode === 'create' ? 'New Position' : 'Edit Position'}</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Senior Accountant"
              {...register('name')}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
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
