from pydantic import BaseModel

# employee_id is intentionally absent from the update payload — it's always the {id} path
# parameter on GET/PUT /api/v1/employees/{id}/special-permissions, never client-supplied
# inside the body (same IDOR-prevention rule as company_id elsewhere in this API).
#
# Every flag is nullable, both here and in the DB (see
# app/models/employee_permission_override.py): null means "no override for this flag, defer
# to the Position", not a fabricated False. A PUT is a full replace — send every flag you
# want set to true; omit or send null for the rest to clear any existing override on them.


class EmployeePermissionOverrideUpdate(BaseModel):
    manage_employees: bool | None = None
    manage_products: bool | None = None
    manage_positions: bool | None = None
    view_salary: bool | None = None


class EmployeePermissionOverrideResponse(BaseModel):
    """A missing EmployeePermissionOverride row is equivalent to one with every flag None —
    see app/models/employee_permission_override.py — so GET always returns a value of this
    shape, never a 404 just because nothing has been overridden yet."""

    employee_id: int
    manage_employees: bool | None
    manage_products: bool | None
    manage_positions: bool | None
    view_salary: bool | None
