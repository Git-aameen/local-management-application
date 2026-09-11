from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Position(Base):
    """Company-defined job title (e.g. "Senior Accountant") that ALSO carries its own five
    permission flags directly (see CLAUDE.md § Authentication & Authorization) — there is no
    more shared "Grade" tier to reference; each Position is configured independently. These
    flags are the sole source of truth for what an employee in this Position can manage
    (app/core/dependencies.py::get_current_employee_context /
    require_position_permission), on top of which an individual employee may additionally
    be granted extra access via
    app/models/employee_permission_override.py::EmployeePermissionOverride — a purely
    additive, purely optional, per-employee exception.

    manage_special_permissions replaced the old "Admin-grade ('A') position" check that
    used to gate GET/PUT /api/v1/employees/{id}/special-permissions — it's just another flag
    on this same Position now, not a magic grade code.

    Previously referenced a "Grade" row live via a composite FK (company_id, grade_code);
    Grade has been retired entirely and its flags folded directly into this table (see the
    merge_grade_into_position_and_drop_grades_table migration). The "can_" prefix these five
    columns originally carried was dropped in drop_can_prefix_from_position_permission_columns
    — a pure naming cleanup, no behavior change.
    """

    __tablename__ = "positions"
    __table_args__ = (Index("ix_positions_company_id", "company_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    manage_employees: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    manage_products: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    manage_positions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    view_salary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    manage_special_permissions: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
