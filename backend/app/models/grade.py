from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Grade(Base):
    """Company-defined pay/permission grade (e.g. "S"/"M"/"HR"/"C"/"A") that a Position can
    be assigned to via Position.grade_code (see app/models/position.py). Replaces the old
    hardcoded frontend grade_code -> permission-defaults mapping (formerly gradeDefaults.ts)
    with a real, per-company customizable source of truth — see CLAUDE.md § Authentication &
    Authorization.

    Composite primary key (company_id, code) — no surrogate id. This makes `code` the
    natural, stable identifier a Position's composite foreign key (company_id, grade_code)
    points to; renaming a grade's code (an UPDATE of this row's own PK) is configured to
    cascade automatically to every Position referencing it (ON UPDATE CASCADE — see the
    ForeignKeyConstraint on Position.__table_args__), rather than requiring an application-
    level rename routine or leaving positions silently pointing at a code that no longer
    exists.

    The four can_* booleans here are the LIVE source of truth for grade-derived permission,
    re-evaluated on every request (see app/core/dependencies.py::get_current_employee_context)
    — editing a Grade immediately changes the effective permissions of every Position (and
    therefore every Employee) linked to it via Position.grade_code. This is a deliberate
    restructuring away from an earlier design where a Position copied these as one-time,
    independently-editable defaults at creation; that per-position override no longer exists.
    An individual employee needing MORE than their role/grade allow is granted that instead
    via app/models/employee_special_permission.py::EmployeeSpecialPermission, a purely
    additive per-employee override. `level` and `name` are informational/display only.
    """

    __tablename__ = "grades"

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), primary_key=True)
    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
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
