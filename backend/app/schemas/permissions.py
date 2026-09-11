from pydantic import BaseModel


class EffectivePermissionsResponse(BaseModel):
    """The current user's Position-derived permissions — see
    app/core/dependencies.py::require_position_permission and CLAUDE.md § Authentication &
    Authorization. This mirrors exactly what that dependency actually enforces server-side
    (including the acting-as-company bypass); the frontend uses it purely for UI convenience
    (hiding buttons a request would be rejected for), never as the actual access-control
    boundary.
    """

    # None for every tenant user — only a super_admin token carries a role claim at all now
    # (see CLAUDE.md § Authentication & Authorization). Reported for display/identity
    # purposes only; it grants none of the flags below.
    role: str | None
    manage_employees: bool
    manage_products: bool
    manage_positions: bool
    view_salary: bool
    # Whether the caller may view/edit ANY employee's special-permissions record — just
    # another Position flag now, with no per-employee override counterpart (see
    # app/models/employee_permission_override.py). Gates the Special Permissions section on
    # the Employee edit view (EmployeeFormDialog.tsx).
    manage_special_permissions: bool
