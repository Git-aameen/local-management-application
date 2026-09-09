import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
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
import { useGrades } from '@/features/grades/hooks'

import { useCreatePosition, useUpdatePosition } from '../hooks'
import type { Position } from '../types'

// Sentinel for "no grade selected" in the dropdown below — never a real grade code (those
// are short, user-chosen strings like "S"/"M"/"HR"/"A"), so it's safe as a Select item value
// distinct from any of them.
const NO_GRADE_VALUE = '__none__'

const positionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  grade_code: z.string(),
})

type PositionFormValues = z.infer<typeof positionSchema>

interface PositionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  position?: Position
}

// A Position carries no permissions of its own anymore — it only references a Grade.
// Permission comes live from that Grade at request time (see app/models/grade.py and
// app/core/dependencies.py::get_current_employee_context), so there's nothing left here to
// pre-fill or leave individually editable per-position; an employee needing more than their
// role/grade allow gets that via the Special Permissions section on their own Employee edit
// view instead (see EmployeeFormDialog.tsx).
export function PositionFormDialog({ open, onOpenChange, mode, position }: PositionFormDialogProps) {
  const { data: grades, isLoading: gradesLoading } = useGrades()
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
        ? { name: position.name, grade_code: position.grade_code ?? NO_GRADE_VALUE }
        : { name: '', grade_code: NO_GRADE_VALUE },
  })

  async function onSubmit(values: PositionFormValues) {
    try {
      const payload = {
        name: values.name,
        grade_code: values.grade_code === NO_GRADE_VALUE ? null : values.grade_code,
      }
      if (mode === 'create') {
        await createPosition.mutateAsync(payload)
      } else if (position) {
        await updatePosition.mutateAsync({ id: position.id, input: payload })
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grade_code">Grade</Label>
            <Controller
              name="grade_code"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={gradesLoading}>
                  <SelectTrigger id="grade_code">
                    <SelectValue placeholder={gradesLoading ? 'Loading grades…' : 'No grade'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GRADE_VALUE}>No grade</SelectItem>
                    {grades?.map((grade) => (
                      <SelectItem key={grade.code} value={grade.code}>
                        {grade.code} — {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {grades && grades.length === 0 && !gradesLoading && (
              <p className="text-sm text-muted-foreground">
                No grades yet for this company — create one on the Grades page first.
              </p>
            )}
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
