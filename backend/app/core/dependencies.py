from collections.abc import Iterable

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import COMPANY_ID_CLAIM, EMAIL_CLAIM, ROLE_CLAIM, verify_access_token
from app.db.session import get_db
from app.models.employee import Employee
from app.models.employee_permission_override import EmployeePermissionOverride
from app.models.position import Position

# auto_error=False so a missing header raises our own 401 in the standard {code, message}
# error shape below, instead of FastAPI/Starlette's default 403 "Not authenticated".
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_claims(
    request: Request,
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
    claims = verify_access_token(credentials.credentials)
    # Stashed so main.py's unhandled_exception_handler can log company_id/email context for
    # any error raised later in this same request, without re-decoding the token itself
    # (CLAUDE.md § Error Handling & Logging: include company_id/user_id/request_id in logs).
    request.state.claims = claims
    return claims


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


def get_current_role(claims: dict = Depends(get_current_claims)) -> str | None:
    """The role claim, present ONLY on super_admin tokens now (see CLAUDE.md §
    Authentication & Authorization) — a tenant user's token carries no role claim at all
    anymore, identified solely by its company_id/email claims instead (see
    get_current_employee_context below). Returns None for every tenant user; the ONLY
    meaningful comparison anywhere in this codebase is `role == "super_admin"`.
    """
    return claims.get(ROLE_CLAIM)


def get_acting_company_id(
    role: str | None = Depends(get_current_role),
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
    role: str | None = Depends(get_current_role),
    acting_company_id: int | None = Depends(get_acting_company_id),
) -> str | None:
    """The role a request should be authorized as: "admin" while a super_admin is acting as
    a company, otherwise exactly the JWT's own role (None for every tenant user — see
    get_current_role). Reported by GET /api/v1/me/permissions for display purposes;
    require_position_permission() below deliberately checks get_acting_company_id() directly
    instead, since it needs "is this an acting super_admin" on its own, not folded into a
    role string.
    """
    return "admin" if acting_company_id is not None else role


def require_role(allowed_roles: Iterable[str]):
    """Dependency factory gating an endpoint to specific roles (see CLAUDE.md § Authentication & Authorization).
    The only remaining caller is POST/PUT /api/v1/companies (require_role(["super_admin"])) —
    every tenant-scoped module now uses require_position_permission() below instead, since
    tenant users no longer carry a role claim at all.

    Usage: `_role: str = Depends(require_role(["super_admin"]))`.
    """
    allowed = set(allowed_roles)

    def _check_role(role: str | None = Depends(get_current_role)) -> str | None:
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
    """Combined Position- and override-derived flags for the current token's matching
    Employee record — see app/models/position.py, app/models/employee_permission_override.py,
    and CLAUDE.md § Authentication & Authorization. Each of the first four flags here is
    (the employee's own Position allows it) OR (the employee's own EmployeePermissionOverride
    record allows it, if one exists and that flag isn't None) — computed once in
    get_current_employee_context() below. manage_special_permissions has no override
    counterpart — it comes from the Position alone.

    get_current_employee_context() only ever returns this for a super_admin token (all False
    — it has no company/Employee by design) or for a token with a real, matched Employee
    row; any other case is a 403 ACCOUNT_NOT_PROVISIONED, not a value of this type. This is
    the SOLE source of truth for manage access to Employees/Positions/Products (see
    require_position_permission() below) — the JWT role plays no part in that decision
    (it's used only to establish identity/tenant membership via get_current_employee_context's
    fail-closed gate, and separately for the platform-level super_admin/Companies concern,
    which is unrelated and unchanged).
    """

    manage_employees: bool = False
    manage_products: bool = False
    manage_positions: bool = False
    view_salary: bool = False
    manage_special_permissions: bool = False


async def get_current_employee_context(
    claims: dict = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> EmployeePermissions:
    """REQUIRED gate, not optional: every non-super_admin token must correspond to a real
    Employee row (matched by email, within the token's company_id) or the request is
    rejected outright with 403 ACCOUNT_NOT_PROVISIONED — fail closed, not fail open. An
    unprovisioned account must not be able to read company data either, not just write it
    (see CLAUDE.md § Multi-Tenant Rules), so this is wired as a router-level dependency on
    every protected router (companies/positions/employees/products/me — see main.py), not
    just on the write endpoints that separately consume its return value via
    require_position_permission() below.

    super_admin is exempt entirely: it has no company_id and no Employee record by design
    (see get_current_company_id), so it skips this check and gets an empty (all-False)
    EmployeePermissions back rather than being evaluated against it — see
    require_position_permission()'s own acting-as-company handling for why that doesn't
    strand a super_admin using X-Acting-Company-Id with no way to manage anything.

    Combines TWO additive sources, per-flag: the employee's own Position (its five
    permission columns directly — no more live Grade join, Grade has been retired) OR the
    employee's own EmployeePermissionOverride row, if one exists and that particular flag
    isn't None.
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
                    Position.manage_employees,
                    Position.manage_products,
                    Position.manage_positions,
                    Position.view_salary,
                    Position.manage_special_permissions,
                )
                .select_from(Employee)
                .join(Position, Employee.position_id == Position.id)
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

    override_result = await db.execute(
        select(
            EmployeePermissionOverride.manage_employees,
            EmployeePermissionOverride.manage_products,
            EmployeePermissionOverride.manage_positions,
            EmployeePermissionOverride.view_salary,
        ).where(EmployeePermissionOverride.employee_id == row.id)
    )
    override = override_result.first()

    return EmployeePermissions(
        manage_employees=bool(row.manage_employees) or bool(override and override.manage_employees),
        manage_products=bool(row.manage_products) or bool(override and override.manage_products),
        manage_positions=bool(row.manage_positions) or bool(override and override.manage_positions),
        view_salary=bool(row.view_salary) or bool(override and override.view_salary),
        manage_special_permissions=bool(row.manage_special_permissions),
    )


def require_position_permission(permission: str):
    """Sole gate on Employees/Positions/Products manage endpoints (create/update/delete) and
    on GET/PUT /api/v1/employees/{id}/special-permissions (via "manage_special_permissions")
    — see CLAUDE.md § Authentication & Authorization. The JWT role plays NO part in this
    decision: access is decided entirely by the caller's own Position (or
    EmployeePermissionOverride, for the four flags that have one) via
    get_current_employee_context(). `permission` must name one of EmployeePermissions'
    boolean fields.

    The one deliberate exception: a super_admin currently acting as a company
    (X-Acting-Company-Id, see get_acting_company_id) is granted every permission
    unconditionally. get_current_employee_context() always returns an all-False
    EmployeePermissions for a super_admin token — it's never a real employee of the
    acted-on company, by design, and that exemption is NOT changed here — so without this
    check "act as company" mode would silently lose all its manage capability (a regression
    of an already-shipped feature), leaving it able to view but never create/update/delete
    anything. Checking get_acting_company_id() directly (rather than get_effective_role())
    keeps privilege-escalation logic in that one function, exactly as every other
    acting-mode-aware dependency in this module already does.

    Usage: `_perm: None = Depends(require_position_permission("manage_employees"))`.
    """

    async def _check(
        employee_permissions: EmployeePermissions = Depends(get_current_employee_context),
        acting_company_id: int | None = Depends(get_acting_company_id),
    ) -> None:
        if acting_company_id is not None or getattr(employee_permissions, permission, False):
            return
        raise HTTPException(
            status_code=403,
            detail={
                "code": "POSITION_PERMISSION_DENIED",
                "message": f"Your position does not grant {permission}.",
            },
        )

    return _check
