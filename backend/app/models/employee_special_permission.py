from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EmployeeSpecialPermission(Base):
    """Optional, per-employee ADDITIVE permission grant — layered on top of whatever the
    employee's system role and their position's Grade already allow (see
    app/core/dependencies.py::get_current_employee_context and CLAUDE.md § Authentication &
    Authorization): effective_permission = (role allows) OR (grade allows) OR (this record
    allows, if one exists). At most one row per employee (unique employee_id) — this table
    only ever grants extra access, it never revokes anything a role or grade already
    provides, and a missing row is equivalent to a row with every flag False.

    Managed via GET/PUT /api/v1/employees/{id}/special-permissions, itself restricted to
    callers who are either system role "admin" or hold a position graded "A" (Admin) — see
    require_admin_role_or_admin_grade() in app/core/dependencies.py.
    """

    __tablename__ = "employee_special_permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False, unique=True)
    can_manage_employees: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    can_manage_products: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    can_manage_positions: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    can_view_salary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
