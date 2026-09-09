from collections.abc import Iterable

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import COMPANY_ID_CLAIM, EMAIL_CLAIM, ROLE_CLAIM, verify_access_token
from app.db.session import get_db
from app.models.employee import Employee
from app.models.employee_special_permission import EmployeeSpecialPermission
from app.models.grade import Grade
from app.models.position import Position

# The one grade code that grants access to a fellow employee's special-permissions record
# (see require_admin_role_or_admin_grade below) — a deliberate, hardcoded convention (not a
# configurable flag on Grade), matching CLAUDE.md § Authentication & Authorization exactly.
ADMIN_GRADE_CODE = "A"

# Shared role sets for each resource's write endpoints — the single source of truth used
# both to enforce access (require_role_or_position_permission(...) calls in
# app/api/v1/{employees,positions,products}.py) and to report it back to the frontend
# (app/api/v1/me.py). Keeping these in one place means the two can never drift apart.
EMPLOYEE_MANAGER_ROLES = ("admin", "hr_manager")
PRODUCT_MANAGER_ROLES = ("admin", "inventory_manager")
POSITION_MANAGER_ROLES = ("admin", "hr_manager")
SALARY_VIEWER_ROLES = ("admin", "hr_manager")

# auto_error=False so a missing header raises our own 401 in the standard {code, message}
# error shape below, instead of FastAPI/Starlette's default 403 "Not authenticated".
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict:
    """Extract the JWT from the Authorization: Bearer header and verify it against Auth0."""
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "MISSING_TOKEN",
                "message": "An Authorization: Bearer <token> header is required.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_access_token(credentials.credentials)


def get_current_company_id(claims: dict = Depends(get_current_claims)) -> int:
    """The authenticated user's company_id, from the verified JWT — never from client input.

    super_admin is a platform-operator role and is issued tokens with no company_id claim
    by design (it isn't scoped to any one tenant). Calling this from a tenant-scoped router
    (employees/products/positions) with a super_admin token is a deliberate, clean 403 —
    super_admin has no tenant to browse — not the generic 401 used for a genuinely
    misconfigured/missing claim on an ordinary tenant-role token.
    """
    raw = claims.get(COMPANY_ID_CLAIM)
    if raw is None:
        if claims.get(ROLE_CLAIM) == "super_admin":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "SUPER_ADMIN_NO_TENANT_ACCESS",
                    "message": "super_admin is a platform-level role and does not have access to tenant-scoped data.",
                },
            )
        raise HTTPException(
            status_code=401,
            detail={"code": "MISSING_COMPANY_CLAIM", "message": "Token is missing the company_id claim."},
        )
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_COMPANY_CLAIM", "message": "Token's company_id claim is malformed."},
        ) from exc


def get_current_role(claims: dict = Depends(get_current_claims)) -> str:
    """The authenticated user's role, from the verified JWT (admin/hr_manager/inventory_manager/employee)."""
    role = claims.get(ROLE_CLAIM)
    if not role:
        raise HTTPException(
            status_code=401,
            detail={"code": "MISSING_ROLE_CLAIM", "message": "Token is missing the role claim."},
        )
    return role


def get_acting_company_id(
    role: str = Depends(get_current_role),
    x_acting_company_id: str | None = Header(default=None, alias="X-Acting-Company-Id"),
) -> int | None:
    """The company_id a super_admin has chosen to "act as" (see CLAUDE.md § Authentication &
    Authorization), or None if acting mode does not apply to this request.

    SECURITY-CRITICAL: this is the ONE place that decides whether X-Acting-Company-Id is
    honored at all. It is honored if and only if the token's own role claim is exactly
    "super_admin" — for every other role the header is parsed here and then unconditionally
    discarded (returns None), before get_effective_company_id/get_effective_role below ever
    see it. Those two functions do not re-check role themselves; they simply trust that a
    non-None value here already means "a genuine super_admin asked for this". This keeps the
    privilege-escalation check in exactly one function instead of duplicated (and
    potentially inconsistently reproduced) in every caller.

    A malformed or non-positive header value is treated the same as no header at all
    (returns None) rather than raising — a super_admin who sends garbage falls back to
    their own (nonexistent) company_id claim and gets the usual clean
    SUPER_ADMIN_NO_TENANT_ACCESS from get_current_company_id, rather than the request
    silently acting as some unintended company.
    """
    if role != "super_admin" or x_acting_company_id is None:
        return None
    try:
        parsed = int(x_acting_company_id)
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def get_effective_company_id(
    claims: dict = Depends(get_current_claims),
    acting_company_id: int | None = Depends(get_acting_company_id),
) -> int:
    """The company_id a request should be scoped to: the super_admin's acting-as company if
    they've chosen one (see get_acting_company_id), otherwise exactly get_current_company_id
    (the JWT's own company_id claim) — unchanged for every non-super_admin role. Use this
    instead of get_current_company_id directly on any endpoint that should support
    "act as company" (Employees/Products/Positions reads and writes, /me/summary); leave
    get_current_company_id itself for endpoints that must always mean "my own company"
    regardless of acting mode (e.g. /me/company).
    """
    if acting_company_id is not None:
        return acting_company_id
    return get_current_company_id(claims)


def get_effective_role(
    role: str = Depends(get_current_role),
    acting_company_id: int | None = Depends(get_acting_company_id),
) -> str:
    """The role a request should be authorized as: "admin" while a super_admin is acting as
    a company (full CRUD, matching a real admin of that company — see
    CLAUDE.md § Authentication & Authorization), otherwise exactly the JWT's own role,
    unchanged. Use this instead of get_current_role wherever a permission check should
    respect acting-as-company mode (require_role_or_position_permission below).
    """
    return "admin" if acting_company_id is not None else role


def require_role(allowed_roles: Iterable[str]):
    """Dependency factory gating an endpoint to specific roles (see CLAUDE.md § Authentication & Authorization).

    Usage: `_role: str = Depends(require_role(["admin", "hr_manager"]))`.
    """
    allowed = set(allowed_roles)

    def _check_role(role: str = Depends(get_current_role)) -> str:
        if role not in allowed:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "FORBIDDEN",
                    "message": f"This action requires one of the following roles: {', '.join(sorted(allowed))}.",
                },
            )
        return role

    return _check_role


class EmployeePermissions(BaseModel):
    """Combined grade- and special-permission-derived flags for the current token's matching
    Employee record — see app/models/grade.py, app/models/employee_special_permission.py,
    and CLAUDE.md § Authentication & Authorization. Each flag here is
    (the employee's position's Grade allows it) OR (the employee's own
    EmployeeSpecialPermission record allows it, if one exists) — computed once in
    get_current_employee_context() below.

    get_current_employee_context() only ever returns this for a super_admin token (all False
    — it has no company/Employee by design) or for a token with a real, matched Employee
    row; any other case is a 403 ACCOUNT_NOT_PROVISIONED, not a value of this type. This type
    is purely ADDITIVE: it's one input to require_role_or_position_permission()'s OR check
    below, never used on its own to restrict anything a role-based check would allow.
    """

    can_manage_employees: bool = False
    can_manage_products: bool = False
    can_manage_positions: bool = False
    can_view_salary: bool = False


async def get_current_employee_context(
    claims: dict = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> EmployeePermissions:
    """REQUIRED gate, not optional: every non-super_admin token must correspond to a real
    Employee row (matched by email, within the token's company_id) or the request is
    rejected outright with 403 ACCOUNT_NOT_PROVISIONED — fail closed, not fail open. An
    unprovisioned account must not be able to read company data either, not just write it
    (see CLAUDE.md § Multi-Tenant Rules), so this is wired as a router-level dependency on
    every protected router (companies/positions/employees/products/grades/me — see main.py),
    not just on the write endpoints that separately consume its return value via
    require_role_or_position_permission() below.

    super_admin is exempt entirely: it has no company_id and no Employee record by design
    (see get_current_company_id), so it skips this check and gets an empty (all-False)
    EmployeePermissions back rather than being evaluated against it.

    Combines TWO additive sources, per-flag: the employee's position's Grade (joined live —
    editing a Grade immediately changes this for everyone on it, see app/models/grade.py)
    OR the employee's own EmployeeSpecialPermission row, if one exists. Neither source can
    ever take access away from the other or from the role-based check in
    require_role_or_position_permission() — this function only ever adds.
    """
    if claims.get(ROLE_CLAIM) == "super_admin":
        return EmployeePermissions()

    raw_company_id = claims.get(COMPANY_ID_CLAIM)
    email = claims.get(EMAIL_CLAIM)

    row = None
    if raw_company_id is not None and email:
        try:
            company_id = int(raw_company_id)
        except (TypeError, ValueError):
            company_id = None
        if company_id is not None:
            result = await db.execute(
                select(
                    Employee.id,
                    Grade.can_manage_employees,
                    Grade.can_manage_products,
                    Grade.can_manage_positions,
                    Grade.can_view_salary,
                )
                .select_from(Employee)
                .join(Position, Employee.position_id == Position.id)
                .outerjoin(
                    Grade,
                    and_(Position.company_id == Grade.company_id, Position.grade_code == Grade.code),
                )
                .where(Employee.company_id == company_id, Employee.email == email)
            )
            row = result.first()

    if row is None:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ACCOUNT_NOT_PROVISIONED",
                "message": (
                    "Your account exists but is not yet linked to an employee record in "
                    "this company. Contact your administrator."
                ),
            },
        )

    special_result = await db.execute(
        select(
            EmployeeSpecialPermission.can_manage_employees,
            EmployeeSpecialPermission.can_manage_products,
            EmployeeSpecialPermission.can_manage_positions,
            EmployeeSpecialPermission.can_view_salary,
        ).where(EmployeeSpecialPermission.employee_id == row.id)
    )
    special = special_result.first()

    return EmployeePermissions(
        can_manage_employees=bool(row.can_manage_employees) or bool(special and special.can_manage_employees),
        can_manage_products=bool(row.can_manage_products) or bool(special and special.can_manage_products),
        can_manage_positions=bool(row.can_manage_positions) or bool(special and special.can_manage_positions),
        can_view_salary=bool(row.can_view_salary) or bool(special and special.can_view_salary),
    )


def require_role_or_position_permission(allowed_roles: Iterable[str], permission: str):
    """Like require_role(), but ADDITIVELY also allows the request through if the caller's
    Employee/Position grants the given permission flag (see get_current_employee_context) —
    an OR, never a replacement: any role in allowed_roles is always still sufficient on its
    own, exactly as require_role() alone would allow. `permission` must name one of
    EmployeePermissions' boolean fields (e.g. "can_manage_employees").

    Checks the EFFECTIVE role (get_effective_role), not the raw JWT role: a super_admin
    acting as a company (X-Acting-Company-Id, see get_acting_company_id) is evaluated here
    as "admin", matching what a real admin of that company could do. For every other role
    this is identical to the JWT's own role — acting mode changes nothing for them.

    Usage: `_role: str = Depends(require_role_or_position_permission(EMPLOYEE_MANAGER_ROLES, "can_manage_employees"))`.
    """
    allowed = set(allowed_roles)

    async def _check(
        role: str = Depends(get_effective_role),
        employee_permissions: EmployeePermissions = Depends(get_current_employee_context),
    ) -> str:
        if role in allowed or getattr(employee_permissions, permission, False):
            return role
        raise HTTPException(
            status_code=403,
            detail={
                "code": "FORBIDDEN",
                "message": (
                    f"This action requires one of the following roles: {', '.join(sorted(allowed))} "
                    "(or an equivalent position permission)."
                ),
            },
        )

    return _check


async def _caller_has_admin_grade_position(claims: dict, db: AsyncSession) -> bool:
    """True if the token's own Employee record (matched by email, within the token's own
    company_id — raw JWT claims, never the acting-as company) sits in a Position graded
    exactly ADMIN_GRADE_CODE ("A"). Used only by get_can_manage_special_permissions below.
    """
    email = claims.get(EMAIL_CLAIM)
    raw_company_id = claims.get(COMPANY_ID_CLAIM)
    if not email or raw_company_id is None:
        return False
    try:
        company_id = int(raw_company_id)
    except (TypeError, ValueError):
        return False

    result = await db.execute(
        select(Grade.code)
        .select_from(Employee)
        .join(Position, Employee.position_id == Position.id)
        .join(
            Grade,
            and_(Position.company_id == Grade.company_id, Position.grade_code == Grade.code),
        )
        .where(Employee.company_id == company_id, Employee.email == email)
    )
    return result.scalar_one_or_none() == ADMIN_GRADE_CODE


async def get_can_manage_special_permissions(
    role: str = Depends(get_effective_role),
    claims: dict = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> bool:
    """Whether the CURRENT caller is allowed to view/edit ANY employee's special-permissions
    record (see GET/PUT /api/v1/employees/{id}/special-permissions) — EITHER:
      a) effective role exactly "admin" (get_effective_role — so a super_admin acting as a
         company is treated as admin here too, consistent with every other acting-mode
         check in this module), OR
      b) their own Employee record's Position is graded "A" (ADMIN_GRADE_CODE), regardless
         of system role.
    A simple OR between the two — either alone is sufficient, matching CLAUDE.md §
    Authentication & Authorization exactly. Note this checks the CALLER's own grade, an
    entirely different question from the flags that endpoint reads/writes for the TARGET
    employee — an admin-grade caller doesn't need special_permissions of their own to manage
    someone else's.

    Returns a plain bool rather than raising, so it doubles as the source of truth both for
    require_admin_role_or_admin_grade() below (the actual enforcement gate) and for
    GET /api/v1/me/permissions' can_manage_special_permissions field, which is what the
    frontend consults to decide whether to render the Special Permissions section at all
    (see EmployeeFormDialog.tsx) — the two can never drift apart.
    """
    return role == "admin" or await _caller_has_admin_grade_position(claims, db)


def require_admin_role_or_admin_grade():
    """Gates GET/PUT /api/v1/employees/{id}/special-permissions (see app/api/v1/employees.py)
    on get_can_manage_special_permissions above."""

    async def _check(can_manage: bool = Depends(get_can_manage_special_permissions)) -> None:
        if can_manage:
            return
        raise HTTPException(
            status_code=403,
            detail={
                "code": "FORBIDDEN",
                "message": (
                    "Managing an employee's special permissions requires the admin role or "
                    "an Admin-grade (\"A\") position."
                ),
            },
        )

    return _check
