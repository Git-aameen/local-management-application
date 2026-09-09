from datetime import datetime

from pydantic import BaseModel, ConfigDict

# company_id is intentionally absent from Create/Update — it is always derived
# server-side from get_current_company_id, never accepted from the client (IDOR prevention).
#
# grade_code is the ONLY permission-adjacent field a Position carries — all grade-derived
# permission comes live from the linked Grade at request time (see app/models/position.py,
# app/models/grade.py, and CLAUDE.md § Authentication & Authorization); a Position no longer
# stores any permission flags of its own. grade_code, if provided, must belong to a grade in
# the same company as the position (see app/services/position_service.py::InvalidGradeError)
# — never trusted blindly. It's also half of a composite foreign key (company_id,
# grade_code) -> grades(company_id, code), ON UPDATE CASCADE — renaming a grade's code
# updates every Position referencing it automatically at the database level. An individual
# employee needing more than their role/grade allow is granted that via
# EmployeeSpecialPermission instead (app/schemas/employee_special_permission.py).


class PositionCreate(BaseModel):
    name: str
    grade_code: str | None = None


class PositionUpdate(BaseModel):
    name: str | None = None
    grade_code: str | None = None


class PositionGradePermissions(BaseModel):
    """Read-only snapshot of the linked Grade's permission flags, included on
    PositionResponse so a caller (e.g. the Employee form's position dropdown — see
    EmployeeFormDialog.tsx / SpecialPermissionsSection.tsx) can see what access a position
    grants before assigning it, without a separate GET /api/v1/grades/{code} call. Always
    reflects the Grade's CURRENT flags (fetched fresh alongside the Position, never cached
    on it) — see app/models/grade.py on why Grade is the live source of truth."""

    can_manage_employees: bool
    can_manage_products: bool
    can_manage_positions: bool
    can_view_salary: bool


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    grade_code: str | None
    grade_permissions: PositionGradePermissions | None
    created_at: datetime
