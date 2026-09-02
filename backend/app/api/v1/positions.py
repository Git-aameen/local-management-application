from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_company_id, require_role
from app.db.session import get_db
from app.schemas.common import ApiResponse, PaginatedResponse
from app.schemas.position import PositionCreate, PositionResponse, PositionUpdate
from app.services import position_service
from app.services.position_service import PositionInUseError

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("", response_model=ApiResponse[PaginatedResponse[PositionResponse]])
async def list_positions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaginatedResponse[PositionResponse]]:
    positions, total = await position_service.list_positions(db, company_id, page, page_size)
    return ApiResponse(
        data=PaginatedResponse(
            items=[PositionResponse.model_validate(p) for p in positions],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/{position_id}", response_model=ApiResponse[PositionResponse])
async def get_position(
    position_id: int,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PositionResponse]:
    position = await position_service.get_position(db, company_id, position_id)
    if position is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "POSITION_NOT_FOUND", "message": "Position not found."},
        )
    return ApiResponse(data=PositionResponse.model_validate(position))


@router.post("", response_model=ApiResponse[PositionResponse], status_code=201)
async def create_position(
    payload: PositionCreate,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "hr_manager"])),
) -> ApiResponse[PositionResponse]:
    position = await position_service.create_position(db, company_id, payload)
    return ApiResponse(data=PositionResponse.model_validate(position))


@router.put("/{position_id}", response_model=ApiResponse[PositionResponse])
async def update_position(
    position_id: int,
    payload: PositionUpdate,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "hr_manager"])),
) -> ApiResponse[PositionResponse]:
    position = await position_service.update_position(db, company_id, position_id, payload)
    if position is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "POSITION_NOT_FOUND", "message": "Position not found."},
        )
    return ApiResponse(data=PositionResponse.model_validate(position))


@router.delete("/{position_id}", response_model=ApiResponse[None])
async def delete_position(
    position_id: int,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "hr_manager"])),
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
