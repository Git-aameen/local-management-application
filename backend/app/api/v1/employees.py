from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_company_id, require_role
from app.db.session import get_db
from app.schemas.common import ApiResponse, PaginatedResponse
from app.schemas.employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate
from app.services import employee_service
from app.services.employee_service import InvalidPositionError

router = APIRouter(prefix="/employees", tags=["employees"])

_INVALID_POSITION_DETAIL = {
    "code": "POSITION_NOT_FOUND",
    "message": "position_id does not exist for this company.",
}


@router.get("", response_model=ApiResponse[PaginatedResponse[EmployeeResponse]])
async def list_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaginatedResponse[EmployeeResponse]]:
    employees, total = await employee_service.list_employees(db, company_id, page, page_size)
    return ApiResponse(
        data=PaginatedResponse(
            items=[EmployeeResponse.model_validate(e) for e in employees],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/{employee_id}", response_model=ApiResponse[EmployeeResponse])
async def get_employee(
    employee_id: int,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[EmployeeResponse]:
    employee = await employee_service.get_employee(db, company_id, employee_id)
    if employee is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "EMPLOYEE_NOT_FOUND", "message": "Employee not found."},
        )
    return ApiResponse(data=EmployeeResponse.model_validate(employee))


@router.post("", response_model=ApiResponse[EmployeeResponse], status_code=201)
async def create_employee(
    payload: EmployeeCreate,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "hr_manager"])),
) -> ApiResponse[EmployeeResponse]:
    try:
        employee = await employee_service.create_employee(db, company_id, payload)
    except InvalidPositionError:
        raise HTTPException(status_code=404, detail=_INVALID_POSITION_DETAIL) from None
    return ApiResponse(data=EmployeeResponse.model_validate(employee))


@router.put("/{employee_id}", response_model=ApiResponse[EmployeeResponse])
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "hr_manager"])),
) -> ApiResponse[EmployeeResponse]:
    try:
        employee = await employee_service.update_employee(db, company_id, employee_id, payload)
    except InvalidPositionError:
        raise HTTPException(status_code=404, detail=_INVALID_POSITION_DETAIL) from None
    if employee is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "EMPLOYEE_NOT_FOUND", "message": "Employee not found."},
        )
    return ApiResponse(data=EmployeeResponse.model_validate(employee))


@router.delete("/{employee_id}", response_model=ApiResponse[None])
async def delete_employee(
    employee_id: int,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "hr_manager"])),
) -> ApiResponse[None]:
    deleted = await employee_service.delete_employee(db, company_id, employee_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"code": "EMPLOYEE_NOT_FOUND", "message": "Employee not found."},
        )
    return ApiResponse(data=None)
