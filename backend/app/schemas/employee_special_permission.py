from pydantic import BaseModel

# employee_id is intentionally absent from the update payload — it's always the {id} path
# parameter on GET/PUT /api/v1/employees/{id}/special-permissions, never client-supplied
# inside the body (same IDOR-prevention rule as company_id elsewhere in this API).


class EmployeeSpecialPermissionsUpdate(BaseModel):
    can_manage_employees: bool | None = None
    can_manage_products: bool | None = None
    can_manage_positions: bool | None = None
    can_view_salary: bool | None = None


class EmployeeSpecialPermissionsResponse(BaseModel):
    """A missing EmployeeSpecialPermission row is equivalent to one with every flag False —
    see app/models/employee_special_permission.py — so GET always returns a value of this
    shape, never a 404 just because nothing has been granted yet."""

    employee_id: int
    can_manage_employees: bool
    can_manage_products: bool
    can_manage_positions: bool
    can_view_salary: bool
