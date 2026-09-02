from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_claims, require_role
from app.db.session import get_db
from app.schemas.common import ApiResponse, PaginatedResponse
from app.schemas.company import CompanyCreate, CompanyResponse, CompanyUpdate
from app.services import company_service

router = APIRouter(prefix="/companies", tags=["companies"])

# Companies has no company_id column to scope by (it IS the tenant table), so unlike
# Positions/Employees/Products it only requires authentication on reads, not a specific
# company. Writes (creating/renaming a tenant) are restricted to super_admin — a
# platform-operator role, entirely separate from a tenant's own admin/hr_manager/
# inventory_manager/employee roles. A regular per-company "admin" must NOT be able to
# create or rename companies; that was a real gap (require_role(["admin"]) previously)
# since "admin" is scoped to one tenant, not the platform.


@router.get("", response_model=ApiResponse[PaginatedResponse[CompanyResponse]])
async def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(get_current_claims),
) -> ApiResponse[PaginatedResponse[CompanyResponse]]:
    companies, total = await company_service.list_companies(db, page, page_size)
    return ApiResponse(
        data=PaginatedResponse(
            items=[CompanyResponse.model_validate(c) for c in companies],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/{company_id}", response_model=ApiResponse[CompanyResponse])
async def get_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(get_current_claims),
) -> ApiResponse[CompanyResponse]:
    company = await company_service.get_company(db, company_id)
    if company is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "COMPANY_NOT_FOUND", "message": "Company not found."},
        )
    return ApiResponse(data=CompanyResponse.model_validate(company))


@router.post("", response_model=ApiResponse[CompanyResponse], status_code=201)
async def create_company(
    payload: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["super_admin"])),
) -> ApiResponse[CompanyResponse]:
    company = await company_service.create_company(db, payload)
    return ApiResponse(data=CompanyResponse.model_validate(company))


@router.put("/{company_id}", response_model=ApiResponse[CompanyResponse])
async def update_company(
    company_id: int,
    payload: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["super_admin"])),
) -> ApiResponse[CompanyResponse]:
    company = await company_service.update_company(db, company_id, payload)
    if company is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "COMPANY_NOT_FOUND", "message": "Company not found."},
        )
    return ApiResponse(data=CompanyResponse.model_validate(company))
