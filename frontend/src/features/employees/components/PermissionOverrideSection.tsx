import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

import { useEmployeePermissionOverride, useUpdateEmployeePermissionOverride } from '../hooks'

interface PermissionOverrideSectionProps {
  employeeId: number
}

interface PermissionOverrideFormValues {
  manage_employees: boolean
  manage_products: boolean
  manage_positions: boolean
  view_salary: boolean
}

// Rendered only when the viewer's own Position grants manage_special_permissions — see
// EmployeeFormDialog.tsx, which gates this entirely (not just disables it) via
// useMyPermissions().manage_special_permissions. A separate mini-form with its own Save
// button: this maps to its own backend resource (GET/PUT
// /api/v1/employees/{id}/special-permissions), independent of the employee's own fields in
// the surrounding form.
//
// Each flag is stored as a nullable override on the backend — null means "no override, defer
// to the Position" (see app/models/employee_permission_override.py) — but a checkbox only
// has two states, so unchecked sends null (clear any override) and checked sends true
// (grant it). There's no need for a UI tri-state: null and an explicit false behave
// identically under the additive OR with the Position's own flags.
export function PermissionOverrideSection({ employeeId }: PermissionOverrideSectionProps) {
  const { data, isLoading, isError } = useEmployeePermissionOverride(employeeId)
  const updateOverride = useUpdateEmployeePermissionOverride(employeeId)

  const { control, handleSubmit, reset } = useForm<PermissionOverrideFormValues>({
    values: data
      ? {
          manage_employees: data.manage_employees ?? false,
          manage_products: data.manage_products ?? false,
          manage_positions: data.manage_positions ?? false,
          view_salary: data.view_salary ?? false,
        }
      : undefined,
  })

  async function onSave(values: PermissionOverrideFormValues) {
    try {
      await updateOverride.mutateAsync({
        manage_employees: values.manage_employees || null,
        manage_products: values.manage_products || null,
        manage_positions: values.manage_positions || null,
        view_salary: values.view_salary || null,
      })
    } catch {
      // The mutation's onError already surfaced an error dialog.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Label>Special Permissions</Label>
      <p className="text-sm text-muted-foreground">
        Grants this employee extra access beyond their Position — this never takes access
        away.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="text-sm text-destructive-light">Could not load special permissions.</p>
      )}

      {data && (
        <form className="flex flex-col gap-2" onSubmit={handleSubmit(onSave)}>
          <PermissionOverrideCheckbox
            name="manage_employees"
            control={control}
            label="Can manage employees"
          />
          <PermissionOverrideCheckbox
            name="manage_products"
            control={control}
            label="Can manage products"
          />
          <PermissionOverrideCheckbox
            name="manage_positions"
            control={control}
            label="Can manage positions"
          />
          <PermissionOverrideCheckbox
            name="view_salary"
            control={control}
            label="Can view salary"
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reset()}
              disabled={updateOverride.isPending}
            >
              Reset
            </Button>
            <Button type="submit" size="sm" disabled={updateOverride.isPending}>
              Save
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

interface PermissionOverrideCheckboxProps {
  name: keyof PermissionOverrideFormValues
  control: ReturnType<typeof useForm<PermissionOverrideFormValues>>['control']
  label: string
}

function PermissionOverrideCheckbox({ name, control, label }: PermissionOverrideCheckboxProps) {
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
