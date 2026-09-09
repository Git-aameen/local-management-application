import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

import { useEmployeeSpecialPermissions, useUpdateEmployeeSpecialPermissions } from '../hooks'

interface SpecialPermissionsSectionProps {
  employeeId: number
}

interface SpecialPermissionsFormValues {
  can_manage_employees: boolean
  can_manage_products: boolean
  can_manage_positions: boolean
  can_view_salary: boolean
}

// Rendered only when the viewer satisfies require_admin_role_or_admin_grade() server-side
// (system role "admin" OR an Admin-grade "A" position) — see EmployeeFormDialog.tsx, which
// gates this entirely (not just disables it) via useMyPermissions().can_manage_special_permissions.
// A separate mini-form with its own Save button: this maps to its own backend resource
// (GET/PUT /api/v1/employees/{id}/special-permissions), independent of the employee's own
// fields in the surrounding form.
export function SpecialPermissionsSection({ employeeId }: SpecialPermissionsSectionProps) {
  const { data, isLoading, isError } = useEmployeeSpecialPermissions(employeeId)
  const updateSpecialPermissions = useUpdateEmployeeSpecialPermissions(employeeId)

  const { control, handleSubmit, reset } = useForm<SpecialPermissionsFormValues>({
    values: data
      ? {
          can_manage_employees: data.can_manage_employees,
          can_manage_products: data.can_manage_products,
          can_manage_positions: data.can_manage_positions,
          can_view_salary: data.can_view_salary,
        }
      : undefined,
  })

  async function onSave(values: SpecialPermissionsFormValues) {
    try {
      await updateSpecialPermissions.mutateAsync(values)
    } catch {
      // The mutation's onError already surfaced an error dialog.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Label>Special Permissions</Label>
      <p className="text-sm text-muted-foreground">
        Grants this employee extra access beyond their system role and grade — this never
        takes access away.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Could not load special permissions.</p>}

      {data && (
        <form className="flex flex-col gap-2" onSubmit={handleSubmit(onSave)}>
          <SpecialPermissionCheckbox
            name="can_manage_employees"
            control={control}
            label="Can manage employees"
          />
          <SpecialPermissionCheckbox
            name="can_manage_products"
            control={control}
            label="Can manage products"
          />
          <SpecialPermissionCheckbox
            name="can_manage_positions"
            control={control}
            label="Can manage positions"
          />
          <SpecialPermissionCheckbox name="can_view_salary" control={control} label="Can view salary" />

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reset()}
              disabled={updateSpecialPermissions.isPending}
            >
              Reset
            </Button>
            <Button type="submit" size="sm" disabled={updateSpecialPermissions.isPending}>
              Save
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

interface SpecialPermissionCheckboxProps {
  name: keyof SpecialPermissionsFormValues
  control: ReturnType<typeof useForm<SpecialPermissionsFormValues>>['control']
  label: string
}

function SpecialPermissionCheckbox({ name, control, label }: SpecialPermissionCheckboxProps) {
  return (
    <div className="flex items-center gap-2">
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
  )
}
