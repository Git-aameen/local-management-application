import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  manage_employees: z.boolean(),
  manage_products: z.boolean(),
  manage_positions: z.boolean(),
  view_salary: z.boolean(),
  manage_special_permissions: z.boolean(),
})

type PositionFormValues = z.infer<typeof positionSchema>

const PERMISSION_CHECKBOXES: Array<{ name: keyof Omit<PositionFormValues, 'name'>; label: string }> = [
  { name: 'manage_employees', label: 'Can manage employees' },
  { name: 'manage_products', label: 'Can manage products' },
  { name: 'manage_positions', label: 'Can manage positions' },
  { name: 'view_salary', label: 'Can view salary' },
  { name: 'manage_special_permissions', label: "Can manage employees' special permissions" },
]

interface PositionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  position?: Position
}

// Each Position is configured with its own five permission flags directly now — there is no
// more shared "Grade" to pick from a dropdown (see CLAUDE.md § Authentication &
// Authorization). An individual employee needing more than their Position allows is granted
// that instead via the Special Permissions section on their own Employee edit view (see
// EmployeeFormDialog.tsx).
export function PositionFormDialog({ open, onOpenChange, mode, position }: PositionFormDialogProps) {
  const createPosition = useCreatePosition()
  const updatePosition = useUpdatePosition()

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PositionFormValues>({
    resolver: zodResolver(positionSchema),
    values:
      mode === 'edit' && position
        ? {
            name: position.name,
            manage_employees: position.manage_employees,
            manage_products: position.manage_products,
            manage_positions: position.manage_positions,
            view_salary: position.view_salary,
            manage_special_permissions: position.manage_special_permissions,
          }
        : {
            name: '',
            manage_employees: false,
            manage_products: false,
            manage_positions: false,
            view_salary: false,
            manage_special_permissions: false,
          },
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
      // The mutation's onError already surfaced an error dialog — keep this dialog open so
      // the user can fix their input and resubmit.
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

          <div className="flex flex-col gap-2">
            <Label>Permissions</Label>
            {PERMISSION_CHECKBOXES.map(({ name, label }) => (
              <div key={name} className="flex items-center gap-2">
                <Controller
                  name={name}
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id={name}
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  )}
                />
                <Label htmlFor={name} className="font-normal">
                  {label}
                </Label>
              </div>
            ))}
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
