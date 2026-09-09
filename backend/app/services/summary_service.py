from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.position import Position
from app.models.product import Product


async def get_company_summary(db: AsyncSession, company_id: int) -> tuple[int, int, int]:
    """(employee_count, position_count, product_count) for one company. company_id must
    already be tenant-resolved by the caller (see get_effective_company_id) — this function
    trusts it as-is and does no further scoping."""
    employee_count = await db.scalar(
        select(func.count()).select_from(Employee).where(Employee.company_id == company_id)
    )
    position_count = await db.scalar(
        select(func.count()).select_from(Position).where(Position.company_id == company_id)
    )
    product_count = await db.scalar(
        select(func.count()).select_from(Product).where(Product.company_id == company_id)
    )
    return employee_count or 0, position_count or 0, product_count or 0
