from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.position import Position
from app.schemas.employee import EmployeeCreate, EmployeeUpdate

# Every function below takes company_id explicitly and filters/checks against it —
# this is what enforces tenant isolation for employees (see CLAUDE.md § Multi-Tenant Rules).
#
# Never log the EmployeeCreate/EmployeeUpdate payloads or Employee rows here — salary and
# email are PII (see CLAUDE.md § Sensitive Data Handling).


class InvalidPositionError(Exception):
    """Raised when position_id doesn't exist or doesn't belong to the given company."""


async def _position_belongs_to_company(db: AsyncSession, company_id: int, position_id: int) -> bool:
    result = await db.execute(
        select(Position.id).where(Position.id == position_id, Position.company_id == company_id)
    )
    return result.scalar_one_or_none() is not None


async def list_employees(
    db: AsyncSession, company_id: int, page: int, page_size: int
) -> tuple[list[Employee], int]:
    total = await db.scalar(
        select(func.count()).select_from(Employee).where(Employee.company_id == company_id)
    )
    result = await db.execute(
        select(Employee)
        .where(Employee.company_id == company_id)
        .order_by(Employee.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(result.scalars().all()), total or 0


async def get_employee(db: AsyncSession, company_id: int, employee_id: int) -> Employee | None:
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_employee(db: AsyncSession, company_id: int, payload: EmployeeCreate) -> Employee:
    if not await _position_belongs_to_company(db, company_id, payload.position_id):
        raise InvalidPositionError

    employee = Employee(
        company_id=company_id,
        position_id=payload.position_id,
        full_name=payload.full_name,
        salary=payload.salary,
        hired_at=payload.hired_at,
        email=payload.email,
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)
    return employee


async def update_employee(
    db: AsyncSession, company_id: int, employee_id: int, payload: EmployeeUpdate
) -> Employee | None:
    employee = await get_employee(db, company_id, employee_id)
    if employee is None:
        return None

    if payload.position_id is not None:
        if not await _position_belongs_to_company(db, company_id, payload.position_id):
            raise InvalidPositionError
        employee.position_id = payload.position_id
    if payload.full_name is not None:
        employee.full_name = payload.full_name
    if payload.salary is not None:
        employee.salary = payload.salary
    if payload.hired_at is not None:
        employee.hired_at = payload.hired_at
    if payload.email is not None:
        employee.email = payload.email

    await db.commit()
    await db.refresh(employee)
    return employee


async def delete_employee(db: AsyncSession, company_id: int, employee_id: int) -> bool:
    # TODO: hard delete for now. Consider a soft delete (e.g. a deleted_at column) once
    # HR record-retention/audit requirements are defined for this project.
    employee = await get_employee(db, company_id, employee_id)
    if employee is None:
        return False
    await db.delete(employee)
    await db.commit()
    return True
