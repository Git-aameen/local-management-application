from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee_special_permission import EmployeeSpecialPermission
from app.schemas.employee_special_permission import EmployeeSpecialPermissionsUpdate

# Tenant isolation for these functions is enforced by the CALLER (see
# app/api/v1/employees.py): employee_id is only ever looked up after confirming, via
# employee_service.get_employee(db, company_id, employee_id), that the employee belongs to
# the caller's own (or acting-as) company — these functions trust employee_id as already
# validated and do no company scoping of their own.


async def get_special_permissions(db: AsyncSession, employee_id: int) -> EmployeeSpecialPermission | None:
    result = await db.execute(
        select(EmployeeSpecialPermission).where(EmployeeSpecialPermission.employee_id == employee_id)
    )
    return result.scalar_one_or_none()


async def upsert_special_permissions(
    db: AsyncSession, employee_id: int, payload: EmployeeSpecialPermissionsUpdate
) -> EmployeeSpecialPermission:
    """Creates the employee's EmployeeSpecialPermission row on first write, updates it on
    every subsequent one — the caller never needs to know which case applies."""
    record = await get_special_permissions(db, employee_id)
    if record is None:
        record = EmployeeSpecialPermission(employee_id=employee_id)
        db.add(record)

    if payload.can_manage_employees is not None:
        record.can_manage_employees = payload.can_manage_employees
    if payload.can_manage_products is not None:
        record.can_manage_products = payload.can_manage_products
    if payload.can_manage_positions is not None:
        record.can_manage_positions = payload.can_manage_positions
    if payload.can_view_salary is not None:
        record.can_view_salary = payload.can_view_salary

    await db.commit()
    await db.refresh(record)
    return record
