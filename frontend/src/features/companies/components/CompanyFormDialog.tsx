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

import { useCreateCompany, useUpdateCompany } from '../hooks'
import type { Company } from '../types'

const companySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
})

type CompanyFormValues = z.infer<typeof companySchema>

interface CompanyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  company?: Company
}

export function CompanyFormDialog({ open, onOpenChange, mode, company }: CompanyFormDialogProps) {
  const createCompany = useCreateCompany()
  const updateCompany = useUpdateCompany()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    values: mode === 'edit' && company ? { name: company.name } : { name: '' },
  })

  async function onSubmit(values: CompanyFormValues) {
    try {
      if (mode === 'create') {
        await createCompany.mutateAsync(values)
      } else if (company) {
        await updateCompany.mutateAsync({ id: company.id, input: values })
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
          <DialogTitle>{mode === 'create' ? 'New Company' : 'Edit Company'}</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Acme Corp"
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
