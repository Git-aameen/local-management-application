from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    POSITION_MANAGER_ROLES,
    get_effective_company_id,
    require_role_or_position_permission,
)
from app.db.session import get_db
from app.models.grade import Grade
from app.models.position import Position
from app.schemas.common import ApiResponse, PaginatedResponse
from app.schemas.position import PositionCreate, PositionGradePermissions, PositionResponse, PositionUpdate
from app.services import grade_service, position_service
from app.services.position_service import InvalidGradeError, PositionInUseError

router = APIRouter(prefix="/positions", tags=["positions"])

_INVALID_GRADE_DETAIL = {
    "code": "GRADE_NOT_FOUND",
    "message": "grade_code does not exist for this company.",
}


def _to_position_response(position: Position, grade: Grade | None) -> PositionResponse:
    return PositionResponse(
        id=position.id,
        company_id=position.company_id,
        name=position.name,
        grade_code=position.grade_code,
        grade_permissions=(
            PositionGradePermissions(
                can_manage_employees=grade.can_manage_employees,
                can_manage_products=grade.can_manage_products,
                can_manage_positions=grade.can_manage_positions,
                can_view_salary=grade.can_view_salary,
            )
            if grade is not None
            else None
        ),
        created_at=position.created_at,
    )


@router.get("", response_model=ApiResponse[PaginatedResponse[PositionResponse]])
async def list_positions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaginatedResponse[PositionResponse]]:
    positions, total = await position_service.list_positions(db, company_id, page, page_size)
    grades_by_code = await grade_service.get_grades_by_code(db, company_id)
    return ApiResponse(
        data=PaginatedResponse(
            items=[
                _to_position_response(p, grades_by_code.get(p.grade_code) if p.grade_code else None)
                for p in positions
            ],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/{position_id}", response_model=ApiResponse[PositionResponse])
async def get_position(
    position_id: int,
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PositionResponse]:
    position = await position_service.get_position(db, company_id, position_id)
    if position is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "POSITION_NOT_FOUND", "message": "Position not found."},
        )
    grade = (
        await grade_service.get_grade(db, company_id, position.grade_code)
        if position.grade_code
        else None
    )
    return ApiResponse(data=_to_position_response(position, grade))


@router.post("", response_model=ApiResponse[PositionResponse], status_code=201)
async def create_position(
    payload: PositionCreate,
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role_or_position_permission(POSITION_MANAGER_ROLES, "can_manage_positions")),
) -> ApiResponse[PositionResponse]:
    try:
        position = await position_service.create_position(db, company_id, payload)
    except InvalidGradeError:
        raise HTTPException(status_code=404, detail=_INVALID_GRADE_DETAIL) from None
    grade = (
        await grade_service.get_grade(db, company_id, position.grade_code)
        if position.grade_code
        else None
    )
    return ApiResponse(data=_to_position_response(position, grade))


@router.put("/{position_id}", response_model=ApiResponse[PositionResponse])
async def update_position(
    position_id: int,
    payload: PositionUpdate,
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role_or_position_permission(POSITION_MANAGER_ROLES, "can_manage_positions")),
) -> ApiResponse[PositionResponse]:
    try:
        position = await position_service.update_position(db, company_id, position_id, payload)
    except InvalidGradeError:
        raise HTTPException(status_code=404, detail=_INVALID_GRADE_DETAIL) from None
    if position is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "POSITION_NOT_FOUND", "message": "Position not found."},
        )
    grade = (
        await grade_service.get_grade(db, company_id, position.grade_code)
        if position.grade_code
        else None
    )
    return ApiResponse(data=_to_position_response(position, grade))


@router.delete("/{position_id}", response_model=ApiResponse[None])
async def delete_position(
    position_id: int,
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role_or_position_permission(POSITION_MANAGER_ROLES, "can_manage_positions")),
) -> ApiResponse[None]:
    try:
        deleted = await position_service.delete_position(db, company_id, position_id)
    except PositionInUseError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "POSITION_IN_USE",
                "message": (
                    f"Cannot delete this position: {exc.employee_count} employee(s) "
                    "are still assigned to it."
                ),
            },
        ) from None
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"code": "POSITION_NOT_FOUND", "message": "Position not found."},
        )
    return ApiResponse(data=None)
