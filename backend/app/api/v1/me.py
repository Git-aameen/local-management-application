from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    EmployeePermissions,
    get_acting_company_id,
    get_current_company_id,
    get_current_employee_context,
    get_effective_company_id,
    get_effective_role,
)
from app.db.session import get_db
from app.schemas.common import ApiResponse
from app.schemas.company import CompanyResponse
from app.schemas.permissions import EffectivePermissionsResponse
from app.schemas.summary import CompanySummaryResponse
from app.services import company_service, summary_service

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/permissions", response_model=ApiResponse[EffectivePermissionsResponse])
async def get_my_permissions(
    role: str | None = Depends(get_effective_role),
    employee_permissions: EmployeePermissions = Depends(get_current_employee_context),
    acting_company_id: int | None = Depends(get_acting_company_id),
) -> ApiResponse[EffectivePermissionsResponse]:
    """Position-derived permissions for the current user — the JWT role plays no part in
    any of the five manage_*/view_salary flags below (see require_position_permission
    in app/core/dependencies.py, the actual enforcement these mirror exactly, so the two can
    never drift apart). `role` is still reported for display purposes and identity checks
    unrelated to these flags (e.g. the frontend's super_admin/Companies handling); it's None
    for every tenant user now, since only super_admin tokens carry a role claim at all.

    manage_special_permissions is whether the caller may view/edit ANY employee's
    special-permissions record at all (GET/PUT /api/v1/employees/{id}/special-permissions) —
    just another Position flag now, with no override counterpart (see
    app/models/employee_permission_override.py). The frontend uses it to decide whether to
    render the Special Permissions section on the Employee edit view (EmployeeFormDialog.tsx).

    Acting-as-company mode: a super_admin sending X-Acting-Company-Id gets every flag True
    here, matching what require_position_permission() actually allows for them — without
    this, get_current_employee_context() would otherwise report all-False for a super_admin
    (it's never a real employee of the acted-on company, by design), which would make the
    frontend hide every manage control an acting super_admin can actually use.
    """
    is_acting = acting_company_id is not None
    return ApiResponse(
        data=EffectivePermissionsResponse(
            role=role,
            manage_employees=is_acting or employee_permissions.manage_employees,
            manage_products=is_acting or employee_permissions.manage_products,
            manage_positions=is_acting or employee_permissions.manage_positions,
            view_salary=is_acting or employee_permissions.view_salary,
            manage_special_permissions=is_acting or employee_permissions.manage_special_permissions,
        )
    )


@router.get("/company", response_model=ApiResponse[CompanyResponse])
async def get_my_company(
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CompanyResponse]:
    """Basic info (id, name, created_at) for the CURRENT user's own company — safe for any
    of the four tenant roles to call without touching the super_admin-only
    GET /api/v1/companies/{id} (app/api/v1/companies.py). company_id always comes from the
    verified JWT via get_current_company_id, never from client input, so there's no IDOR
    surface here: a caller can only ever get their own company back.

    get_current_company_id() itself rejects a super_admin token with a clean 403
    SUPER_ADMIN_NO_TENANT_ACCESS before this body runs — super_admin isn't scoped to any
    one company, so "my company" doesn't apply to it.
    """
    company = await company_service.get_company(db, company_id)
    if company is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "COMPANY_NOT_FOUND", "message": "Company not found."},
        )
    return ApiResponse(data=CompanyResponse.model_validate(company))


@router.get("/summary", response_model=ApiResponse[CompanySummaryResponse])
async def get_my_summary(
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[CompanySummaryResponse]:
    """Dashboard record counts for the current company context. No role restriction — every
    authenticated, provisioned tenant role can call this equally, matching the existing
    universal read access on the list endpoints (GET /employees, /products, /positions).

    Uses get_effective_company_id, not get_current_company_id: a super_admin sending
    X-Acting-Company-Id gets counts for that acting company; everyone else (and a
    super_admin with no header) gets exactly what get_current_company_id would already
    give — their own company, or a clean 403 SUPER_ADMIN_NO_TENANT_ACCESS respectively.
    """
    employee_count, position_count, product_count = await summary_service.get_company_summary(
        db, company_id
    )
    return ApiResponse(
        data=CompanySummaryResponse(
            employee_count=employee_count,
            position_count=position_count,
            product_count=product_count,
        )
    )
