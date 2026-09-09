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

import { useCreateGrade, useUpdateGrade } from '../hooks'
import type { Grade } from '../types'

const gradeSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(16),
  name: z.string().trim().min(1, 'Name is required'),
  level: z.number().int('Level must be a whole number'),
  can_manage_employees: z.boolean(),
  can_manage_products: z.boolean(),
  can_manage_positions: z.boolean(),
  can_view_salary: z.boolean(),
})

type GradeFormValues = z.infer<typeof gradeSchema>

interface GradeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  grade?: Grade
}

export function GradeFormDialog({ open, onOpenChange, mode, grade }: GradeFormDialogProps) {
  const createGrade = useCreateGrade()
  const updateGrade = useUpdateGrade()

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GradeFormValues>({
    resolver: zodResolver(gradeSchema),
    values:
      mode === 'edit' && grade
        ? {
            code: grade.code,
            name: grade.name,
            level: grade.level,
            can_manage_employees: grade.can_manage_employees,
            can_manage_products: grade.can_manage_products,
            can_manage_positions: grade.can_manage_positions,
            can_view_salary: grade.can_view_salary,
          }
        : {
            code: '',
            name: '',
            level: 0,
            can_manage_employees: false,
            can_manage_products: false,
            can_manage_positions: false,
            can_view_salary: false,
          },
  })

  async function onSubmit(values: GradeFormValues) {
    try {
      if (mode === 'create') {
        await createGrade.mutateAsync(values)
      } else if (grade) {
        // Identify the row to update by its ORIGINAL code (grade.code, the prop) — values
        // may itself contain a NEW code if the user renamed it; the composite FK on
        // Position (company_id, grade_code) is ON UPDATE CASCADE, so every position
        // referencing this grade follows the rename automatically at the database level.
        await updateGrade.mutateAsync({ code: grade.code, input: values })
      }
      onOpenChange(false)
      reset()
    } catch {
      // The mutation's onError already surfaced an error dialog (e.g. a duplicate code) —
      // keep this dialog open so the user can fix their input and resubmit.
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
          <DialogTitle>{mode === 'create' ? 'New Grade' : 'Edit Grade'}</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" placeholder="e.g. M, HR, A" {...register('code')} aria-invalid={!!errors.code} />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="e.g. Manager" {...register('name')} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="level">Level</Label>
            <Input
              id="level"
              type="number"
              {...register('level', { valueAsNumber: true })}
              aria-invalid={!!errors.level}
            />
            {errors.level && <p className="text-sm text-destructive">{errors.level.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Permissions</Label>
            <p className="text-sm text-muted-foreground">
              Granted live to every position using this grade (and everyone in one of those
              positions) — changing these takes effect immediately, everywhere this grade is
              assigned.
            </p>

            <div className="flex items-center gap-2">
              <Controller
                name="can_manage_employees"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="can_manage_employees"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <Label htmlFor="can_manage_employees" className="font-normal">
                Can manage employees
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Controller
                name="can_manage_products"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="can_manage_products"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <Label htmlFor="can_manage_products" className="font-normal">
                Can manage products
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Controller
                name="can_manage_positions"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="can_manage_positions"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <Label htmlFor="can_manage_positions" className="font-normal">
                Can manage positions
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Controller
                name="can_view_salary"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="can_view_salary"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <Label htmlFor="can_view_salary" className="font-normal">
                Can view salary
              </Label>
            </div>
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
