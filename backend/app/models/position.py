from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, ForeignKeyConstraint, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Position(Base):
    """Company-defined job title (e.g. "Senior Accountant"). HR data only — unrelated to Auth0-based RBAC.

    A Position carries no permissions of its own anymore — it only references a Grade via
    grade_code, a COMPOSITE foreign key (company_id, grade_code) -> grades(company_id, code)
    — see app/models/grade.py, which now uses that composite (company_id, code) as its own
    primary key instead of a surrogate id. ON UPDATE CASCADE is configured on this
    constraint: renaming a grade's code updates every Position referencing it automatically
    at the database level, never silently orphaning a position. All grade-derived permission
    comes from that Grade's four can_* flags directly, re-evaluated live at request time
    (see app/core/dependencies.py::get_current_employee_context) — editing a Grade
    immediately changes the effective permissions of every Position (and therefore every
    Employee) linked to it. An individual employee needing MORE than their role/grade allow
    is granted that instead via
    app/models/employee_special_permission.py::EmployeeSpecialPermission, a purely additive
    per-employee grant — see CLAUDE.md § Authentication & Authorization.

    A former free-text, unmapped `grade_code` column (holding values like "M1", "S2" from
    before Grade existed as a real table) occupied this same column name previously and has
    been dropped — this grade_code is an unrelated, newly (re)introduced column that happens
    to share that name, now serving as half of the composite FK described above.
    """

    __tablename__ = "positions"
    __table_args__ = (
        Index("ix_positions_company_id", "company_id"),
        Index("ix_positions_company_id_grade_code", "company_id", "grade_code"),
        ForeignKeyConstraint(
            ["company_id", "grade_code"],
            ["grades.company_id", "grades.code"],
            name="fk_positions_company_id_grade_code_grades",
            onupdate="CASCADE",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    grade_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
