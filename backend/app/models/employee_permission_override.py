from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EmployeePermissionOverride(Base):
    """Optional, per-employee ADDITIVE permission grant — layered on top of whatever the
    employee's own Position already allows (see
    app/core/dependencies.py::get_current_employee_context and CLAUDE.md § Authentication &
    Authorization): effective_permission = (Position allows) OR (this record's flag is
    True). At most one row per employee (unique employee_id).

    Each flag is NULLABLE — None means "no override for this flag, defer entirely to the
    Position", a distinct, real state from an explicit False (though the two currently
    behave identically under the additive OR above, since neither one ever subtracts
    anything the Position already grants). A missing row entirely is equivalent to a row
    with every flag None — this table only ever grants extra access, never revokes it.

    Managed via GET/PUT /api/v1/employees/{id}/special-permissions, itself restricted to
    callers whose own Position grants manage_special_permissions — see
    require_position_permission() in app/core/dependencies.py.
    """

    __tablename__ = "employee_permission_overrides"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False, unique=True)
    manage_employees: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    manage_products: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    manage_positions: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    view_salary: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
