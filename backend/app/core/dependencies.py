from collections.abc import Iterable

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import COMPANY_ID_CLAIM, ROLE_CLAIM, verify_access_token

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
