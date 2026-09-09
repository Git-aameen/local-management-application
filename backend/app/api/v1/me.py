from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    EMPLOYEE_MANAGER_ROLES,
    POSITION_MANAGER_ROLES,
    PRODUCT_MANAGER_ROLES,
    SALARY_VIEWER_ROLES,
    EmployeePermissions,
    get_can_manage_special_permissions,
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
    role: str = Depends(get_effective_role),
    employee_permissions: EmployeePermissions = Depends(get_current_employee_context),
    can_manage_special_permissions: bool = Depends(get_can_manage_special_permissions),
) -> ApiResponse[EffectivePermissionsResponse]:
    """Effective (role OR grade OR special-permission) permissions for the current user.
    Works for super_admin too (role="super_admin", every flag False —
    get_current_employee_context() never raises for a token with no company_id, it just
    reports no extra permissions), and reflects acting-as-company mode: a super_admin
    sending X-Acting-Company-Id is reported here as role="admin" with every flag True,
    matching get_effective_role (app/core/dependencies.py).

    can_manage_special_permissions is a DIFFERENT question from the four can_manage_*/
    can_view_salary flags above — it's whether the caller may view/edit ANY employee's
    special-permissions record at all (GET/PUT /api/v1/employees/{id}/special-permissions),
    not a permission that's itself granted by role/grade/special-permissions. The frontend
    uses it to decide whether to render the Special Permissions section on the Employee edit
    view (see EmployeeFormDialog.tsx).
    """
    return ApiResponse(
        data=EffectivePermissionsResponse(
            role=role,
            can_manage_employees=role in EMPLOYEE_MANAGER_ROLES or employee_permissions.can_manage_employees,
            can_manage_products=role in PRODUCT_MANAGER_ROLES or employee_permissions.can_manage_products,
            can_manage_positions=role in POSITION_MANAGER_ROLES or employee_permissions.can_manage_positions,
            can_view_salary=role in SALARY_VIEWER_ROLES or employee_permissions.can_view_salary,
            can_manage_special_permissions=can_manage_special_permissions,
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
