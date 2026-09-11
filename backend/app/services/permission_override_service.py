from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee_permission_override import EmployeePermissionOverride
from app.schemas.employee_permission_override import EmployeePermissionOverrideUpdate

# Tenant isolation for these functions is enforced by the CALLER (see
# app/api/v1/employees.py): employee_id is only ever looked up after confirming, via
# employee_service.get_employee(db, company_id, employee_id), that the employee belongs to
# the caller's own (or acting-as) company — these functions trust employee_id as already
# validated and do no company scoping of their own.


async def get_permission_override(db: AsyncSession, employee_id: int) -> EmployeePermissionOverride | None:
    result = await db.execute(
        select(EmployeePermissionOverride).where(EmployeePermissionOverride.employee_id == employee_id)
    )
    return result.scalar_one_or_none()


async def upsert_permission_override(
    db: AsyncSession, employee_id: int, payload: EmployeePermissionOverrideUpdate
) -> EmployeePermissionOverride:
    """Creates the employee's EmployeePermissionOverride row on first write, updates it on
    every subsequent one — the caller never needs to know which case applies. A full
    replace: each flag is set to exactly what the payload carries (True or None), never
    merged with the previous value — sending None clears that flag's override."""
    record = await get_permission_override(db, employee_id)
    if record is None:
        record = EmployeePermissionOverride(employee_id=employee_id)
        db.add(record)

    record.manage_employees = payload.manage_employees
    record.manage_products = payload.manage_products
    record.manage_positions = payload.manage_positions
    record.view_salary = payload.view_salary

    await db.commit()
    await db.refresh(record)
    return record
