from pydantic import BaseModel


class EffectivePermissionsResponse(BaseModel):
    """The current user's effective (role OR position) permissions — see
    app/core/dependencies.py::require_role_or_position_permission and CLAUDE.md §
    Authentication & Authorization. This mirrors the exact same OR logic enforced
    server-side on write endpoints; the frontend uses it purely for UI convenience (hiding
    buttons a request would be rejected for), never as the actual access-control boundary.
    """

    role: str
    can_manage_employees: bool
    can_manage_products: bool
    can_manage_positions: bool
    can_view_salary: bool
    # Whether the caller may view/edit ANY employee's special-permissions record — a
    # different question from the four flags above (see get_can_manage_special_permissions
    # in app/core/dependencies.py). Gates the Special Permissions section on the Employee
    # edit view (EmployeeFormDialog.tsx), not itself one of the OR-combined permissions.
    can_manage_special_permissions: bool
