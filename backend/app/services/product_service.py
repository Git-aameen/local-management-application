from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate

# Every function below takes company_id explicitly and filters/checks against it —
# this is what enforces tenant isolation for products (see CLAUDE.md § Multi-Tenant Rules).
#
# Quantity must never go negative: ProductCreate/ProductUpdate.quantity is constrained to
# >= 0 via Field(ge=0) at the schema layer (see app/schemas/product.py), so a request that
# would drive quantity negative is rejected as a 400 VALIDATION_ERROR before it ever reaches
# this service — no separate runtime check is needed here for the plain "set" semantics
# these endpoints use. Revisit this if a future delta-style stock-adjustment endpoint is added.


async def list_products(
    db: AsyncSession,
    company_id: int,
    page: int,
    page_size: int,
    category: str | None = None,
) -> tuple[list[Product], int]:
    filters = [Product.company_id == company_id]
    if category is not None:
        filters.append(Product.category == category)

    total = await db.scalar(select(func.count()).select_from(Product).where(*filters))
    result = await db.execute(
        select(Product)
        .where(*filters)
        .order_by(Product.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(result.scalars().all()), total or 0


async def get_product(db: AsyncSession, company_id: int, product_id: int) -> Product | None:
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_product(db: AsyncSession, company_id: int, payload: ProductCreate) -> Product:
    product = Product(
        company_id=company_id,
        name=payload.name,
        category=payload.category,
        quantity=payload.quantity,
        price=payload.price,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


async def update_product(
    db: AsyncSession, company_id: int, product_id: int, payload: ProductUpdate
) -> Product | None:
    product = await get_product(db, company_id, product_id)
    if product is None:
        return None

    if payload.name is not None:
        product.name = payload.name
    if payload.category is not None:
        product.category = payload.category
    if payload.quantity is not None:
        product.quantity = payload.quantity
    if payload.price is not None:
        product.price = payload.price

    await db.commit()
    await db.refresh(product)
    return product


async def delete_product(db: AsyncSession, company_id: int, product_id: int) -> bool:
    # TODO: hard delete for now. Consider a soft delete (e.g. a deleted_at column) once
    # inventory audit/history requirements are defined for this project.
    product = await get_product(db, company_id, product_id)
    if product is None:
        return False
    await db.delete(product)
    await db.commit()
    return True
