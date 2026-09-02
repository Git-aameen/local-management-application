from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.position import Position
from app.schemas.position import PositionCreate, PositionUpdate

# Every function below takes company_id explicitly and filters/checks against it —
# this is what enforces tenant isolation for positions (see CLAUDE.md § Multi-Tenant Rules).


class PositionInUseError(Exception):
    """Raised when attempting to delete a position that is still assigned to employees.

    employees.position_id has no ON DELETE behavior (plain ForeignKey), so without this
    check the DELETE would hit a raw IntegrityError at the DB level instead of a clean,
    actionable error.
    """

    def __init__(self, employee_count: int):
        self.employee_count = employee_count


async def list_positions(
    db: AsyncSession, company_id: int, page: int, page_size: int
) -> tuple[list[Position], int]:
    total = await db.scalar(
        select(func.count()).select_from(Position).where(Position.company_id == company_id)
    )
    result = await db.execute(
        select(Position)
        .where(Position.company_id == company_id)
        .order_by(Position.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(result.scalars().all()), total or 0


async def get_position(db: AsyncSession, company_id: int, position_id: int) -> Position | None:
    result = await db.execute(
        select(Position).where(Position.id == position_id, Position.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_position(db: AsyncSession, company_id: int, payload: PositionCreate) -> Position:
    position = Position(company_id=company_id, name=payload.name)
    db.add(position)
    await db.commit()
    await db.refresh(position)
    return position


async def update_position(
    db: AsyncSession, company_id: int, position_id: int, payload: PositionUpdate
) -> Position | None:
    position = await get_position(db, company_id, position_id)
    if position is None:
        return None
    if payload.name is not None:
        position.name = payload.name
    await db.commit()
    await db.refresh(position)
    return position


async def delete_position(db: AsyncSession, company_id: int, position_id: int) -> bool:
    position = await get_position(db, company_id, position_id)
    if position is None:
        return False

    employee_count = await db.scalar(
        select(func.count()).select_from(Employee).where(Employee.position_id == position_id)
    )
    if employee_count:
        raise PositionInUseError(employee_count)

    await db.delete(position)
    await db.commit()
    return True
