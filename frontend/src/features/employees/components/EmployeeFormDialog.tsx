import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, type Resolver, useForm } from 'react-hook-form'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePermissions } from '@/features/auth/hooks'

import { useCreateEmployee, usePositions, useUpdateEmployee } from '../hooks'
import type { Employee } from '../types'

const baseEmployeeSchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  // position_id defaults to 0 (falsy, so the Select shows its placeholder) until a real
  // position is chosen, so "nothing selected" and "invalid value" both fail .positive().
  position_id: z.number().int().positive('Select a position'),
  hired_at: z.string().min(1, 'Hire date is required'),
})

const employeeSchemaWithSalary = baseEmployeeSchema.extend({
  salary: z.number().positive('Salary must be greater than 0'),
})

// A single shape covers both the with-salary and without-salary resolvers: salary is only
// present (and required, via employeeSchemaWithSalary) when the viewer has canViewSalary —
// this is now independent of create-vs-edit mode (see EmployeeFormDialog below).
type FormValues = z.infer<typeof baseEmployeeSchema> & { salary?: number }

interface EmployeeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  employee?: Employee
}

export function EmployeeFormDialog({ open, onOpenChange, mode, employee }: EmployeeFormDialogProps) {
  const { canViewSalary } = usePermissions()
  const { data: positions, isLoading: positionsLoading } = usePositions()
  const createEmployee = useCreateEmployee()
  const updateEmployee = useUpdateEmployee()

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: (canViewSalary
      ? zodResolver(employeeSchemaWithSalary)
      : zodResolver(baseEmployeeSchema)) as Resolver<FormValues>,
    values:
      mode === 'edit' && employee
        ? {
            full_name: employee.full_name,
            email: employee.email,
            position_id: employee.position_id,
            hired_at: employee.hired_at,
            ...(canViewSalary ? { salary: Number(employee.salary) } : {}),
          }
        : {
            full_name: '',
            email: '',
            position_id: 0,
            hired_at: '',
            ...(canViewSalary ? { salary: 0 } : {}),
          },
  })

  async function onSubmit(values: FormValues) {
    try {
      if (mode === 'create') {
        await createEmployee.mutateAsync({
          full_name: values.full_name,
          email: values.email,
          position_id: values.position_id,
          hired_at: values.hired_at,
          // create requires a starting salary; reaching this dialog at all already implies
          // canManageEmployees, which today is the exact same role set as canViewSalary.
          salary: values.salary as number,
        })
      } else if (employee) {
        await updateEmployee.mutateAsync({
          id: employee.id,
          input: {
            full_name: values.full_name,
            email: values.email,
            position_id: values.position_id,
            hired_at: values.hired_at,
            ...(canViewSalary ? { salary: values.salary } : {}),
          },
        })
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
          <DialogTitle>{mode === 'create' ? 'New Employee' : 'Edit Employee'}</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" {...register('full_name')} aria-invalid={!!errors.full_name} />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="position_id">Position</Label>
            <Controller
              name="position_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ? String(field.value) : undefined}
                  onValueChange={(value) => field.onChange(Number(value))}
                  disabled={positionsLoading}
                >
                  <SelectTrigger id="position_id" aria-invalid={!!errors.position_id}>
                    <SelectValue
                      placeholder={positionsLoading ? 'Loading positions…' : 'Select a position'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {positions?.map((position) => (
                      <SelectItem key={position.id} value={String(position.id)}>
                        {position.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {positions && positions.length === 0 && !positionsLoading && (
              <p className="text-sm text-muted-foreground">
                No positions yet for this company — create one first.
              </p>
            )}
            {errors.position_id && (
              <p className="text-sm text-destructive">{errors.position_id.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hired_at">Hire date</Label>
            <Input
              id="hired_at"
              type="date"
              {...register('hired_at')}
              aria-invalid={!!errors.hired_at}
            />
            {errors.hired_at && (
              <p className="text-sm text-destructive">{errors.hired_at.message}</p>
            )}
          </div>

          {canViewSalary && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="salary">{mode === 'create' ? 'Starting salary' : 'Salary'}</Label>
              <Input
                id="salary"
                type="number"
                step="0.01"
                min="0"
                {...register('salary', { valueAsNumber: true })}
                aria-invalid={!!errors.salary}
              />
              {errors.salary && (
                <p className="text-sm text-destructive">{errors.salary.message}</p>
              )}
            </div>
          )}

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
