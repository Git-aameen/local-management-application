from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_company_id, require_role
from app.db.session import get_db
from app.schemas.common import ApiResponse, PaginatedResponse
from app.schemas.product import ProductCreate, ProductResponse, ProductUpdate
from app.services import product_service

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ApiResponse[PaginatedResponse[ProductResponse]])
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: str | None = Query(default=None),
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[PaginatedResponse[ProductResponse]]:
    products, total = await product_service.list_products(db, company_id, page, page_size, category)
    return ApiResponse(
        data=PaginatedResponse(
            items=[ProductResponse.model_validate(p) for p in products],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/{product_id}", response_model=ApiResponse[ProductResponse])
async def get_product(
    product_id: int,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ProductResponse]:
    product = await product_service.get_product(db, company_id, product_id)
    if product is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "PRODUCT_NOT_FOUND", "message": "Product not found."},
        )
    return ApiResponse(data=ProductResponse.model_validate(product))


@router.post("", response_model=ApiResponse[ProductResponse], status_code=201)
async def create_product(
    payload: ProductCreate,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "inventory_manager"])),
) -> ApiResponse[ProductResponse]:
    product = await product_service.create_product(db, company_id, payload)
    return ApiResponse(data=ProductResponse.model_validate(product))


@router.put("/{product_id}", response_model=ApiResponse[ProductResponse])
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "inventory_manager"])),
) -> ApiResponse[ProductResponse]:
    product = await product_service.update_product(db, company_id, product_id, payload)
    if product is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "PRODUCT_NOT_FOUND", "message": "Product not found."},
        )
    return ApiResponse(data=ProductResponse.model_validate(product))


@router.delete("/{product_id}", response_model=ApiResponse[None])
async def delete_product(
    product_id: int,
    company_id: int = Depends(get_current_company_id),
    db: AsyncSession = Depends(get_db),
    _role: str = Depends(require_role(["admin", "inventory_manager"])),
) -> ApiResponse[None]:
    deleted = await product_service.delete_product(db, company_id, product_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"code": "PRODUCT_NOT_FOUND", "message": "Product not found."},
        )
    return ApiResponse(data=None)
