from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    POSITION_MANAGER_ROLES,
    get_effective_company_id,
    require_role_or_position_permission,
)
from app.db.session import get_db
from app.schemas.common import ApiResponse, PaginatedResponse
from app.schemas.grade import GradeCreate, GradeResponse, GradeUpdate
from app.services import grade_service
from app.services.grade_service import DuplicateGradeCodeError, GradeInUseError

router = APIRouter(prefix="/grades", tags=["grades"])

# Grades and Positions are managed by the same people — same POSITION_MANAGER_ROLES /
# can_manage_positions gate on writes as app/api/v1/positions.py (see CLAUDE.md §
# Authentication & Authorization).

_DUPLICATE_CODE_DETAIL = {
    "code": "GRADE_CODE_ALREADY_EXISTS",
    "message": "A grade with this code already exists for this company.",
}
_GRADE_NOT_FOUND_DETAIL = {"code": "GRADE_NOT_FOUND", "message": "Grade not found."}


@router.get("", response_model=ApiResponse[PaginatedResponse[GradeResponse]])
async def list_grades(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaginatedResponse[GradeResponse]]:
    grades, total = await grade_service.list_grades(db, company_id, page, page_size)
    return ApiResponse(
        data=PaginatedResponse(
            items=[GradeResponse.model_validate(g) for g in grades],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/{code}", response_model=ApiResponse[GradeResponse])
async def get_grade(
    code: str,
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[GradeResponse]:
    grade = await grade_service.get_grade(db, company_id, code)
    if grade is None:
        raise HTTPException(status_code=404, detail=_GRADE_NOT_FOUND_DETAIL)
    return ApiResponse(data=GradeResponse.model_validate(grade))


@router.post("", response_model=ApiResponse[GradeResponse], status_code=201)
async def create_grade(
    payload: GradeCreate,
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role_or_position_permission(POSITION_MANAGER_ROLES, "can_manage_positions")),
) -> ApiResponse[GradeResponse]:
    try:
        grade = await grade_service.create_grade(db, company_id, payload)
    except DuplicateGradeCodeError:
        raise HTTPException(status_code=409, detail=_DUPLICATE_CODE_DETAIL) from None
    return ApiResponse(data=GradeResponse.model_validate(grade))


@router.put("/{code}", response_model=ApiResponse[GradeResponse])
async def update_grade(
    code: str,
    payload: GradeUpdate,
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role_or_position_permission(POSITION_MANAGER_ROLES, "can_manage_positions")),
) -> ApiResponse[GradeResponse]:
    try:
        grade = await grade_service.update_grade(db, company_id, code, payload)
    except DuplicateGradeCodeError:
        raise HTTPException(status_code=409, detail=_DUPLICATE_CODE_DETAIL) from None
    if grade is None:
        raise HTTPException(status_code=404, detail=_GRADE_NOT_FOUND_DETAIL)
    return ApiResponse(data=GradeResponse.model_validate(grade))


@router.delete("/{code}", response_model=ApiResponse[None])
async def delete_grade(
    code: str,
    company_id: int = Depends(get_effective_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role_or_position_permission(POSITION_MANAGER_ROLES, "can_manage_positions")),
) -> ApiResponse[None]:
    try:
        deleted = await grade_service.delete_grade(db, company_id, code)
    except GradeInUseError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "GRADE_IN_USE",
                "message": (
                    f"Cannot delete this grade: {exc.position_count} position(s) "
                    "are still assigned to it."
                ),
            },
        ) from None
    if not deleted:
        raise HTTPException(status_code=404, detail=_GRADE_NOT_FOUND_DETAIL)
    return ApiResponse(data=None)
