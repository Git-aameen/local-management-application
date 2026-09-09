from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grade import Grade
from app.models.position import Position
from app.schemas.grade import GradeCreate, GradeUpdate

# Every function below takes company_id explicitly and filters/checks against it — this is
# what enforces tenant isolation for grades (see CLAUDE.md § Multi-Tenant Rules).
#
# Grade's primary key is (company_id, code) — no surrogate id (see app/models/grade.py) —
# so every lookup below is keyed by `code` directly, and updating a grade's own `code`
# genuinely renames its primary key; the composite FK on Position (company_id, grade_code)
# is ON UPDATE CASCADE, so Postgres itself propagates that rename to every Position
# referencing it. No application-level rename routine exists or is needed.

# Seeded for every company at creation time (POST /api/v1/companies) and, historically, once
# for every pre-existing company by the add_grades_table_and_position_grade_id migration —
# see that migration's _GRADE_SEED_DATA, which this must stay in sync with.
DEFAULT_GRADE_SEED_DATA: list[tuple[str, str, int, bool, bool, bool, bool]] = [
    ("S", "Staff", 1, False, True, False, False),
    ("M", "Manager", 2, True, True, False, False),
    ("HR", "HR", 2, True, False, False, True),
    ("C", "Chief", 3, True, True, True, True),
    ("A", "Admin", 4, True, True, True, True),
]


class GradeInUseError(Exception):
    """Raised when attempting to delete a grade that is still assigned to positions.

    positions.grade_code has no ON DELETE behavior (the composite FK only specifies
    ON UPDATE CASCADE), so without this check the DELETE would hit a raw IntegrityError at
    the DB level instead of a clean, actionable error — same protective pattern as
    PositionInUseError (see position_service.py).
    """

    def __init__(self, position_count: int):
        self.position_count = position_count


class DuplicateGradeCodeError(Exception):
    """Raised when creating/updating a grade would violate the (company_id, code) primary
    key — surfaced as a clean 409, not a raw IntegrityError."""


async def list_grades(
    db: AsyncSession, company_id: int, page: int, page_size: int
) -> tuple[list[Grade], int]:
    total = await db.scalar(
        select(func.count()).select_from(Grade).where(Grade.company_id == company_id)
    )
    result = await db.execute(
        select(Grade)
        .where(Grade.company_id == company_id)
        .order_by(Grade.level, Grade.code)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(result.scalars().all()), total or 0


async def get_grades_by_code(db: AsyncSession, company_id: int) -> dict[str, Grade]:
    """Every one of a company's grades, keyed by code — used to enrich a page of Position
    responses with their linked Grade's permission flags in one query instead of one query
    per position (see app/api/v1/positions.py::_to_position_response)."""
    result = await db.execute(select(Grade).where(Grade.company_id == company_id))
    return {grade.code: grade for grade in result.scalars().all()}


async def get_grade(db: AsyncSession, company_id: int, code: str) -> Grade | None:
    result = await db.execute(
        select(Grade).where(Grade.code == code, Grade.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_grade(db: AsyncSession, company_id: int, payload: GradeCreate) -> Grade:
    grade = Grade(
        company_id=company_id,
        code=payload.code,
        name=payload.name,
        level=payload.level,
        can_manage_employees=payload.can_manage_employees,
        can_manage_products=payload.can_manage_products,
        can_manage_positions=payload.can_manage_positions,
        can_view_salary=payload.can_view_salary,
    )
    db.add(grade)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise DuplicateGradeCodeError() from None
    await db.refresh(grade)
    return grade


async def update_grade(
    db: AsyncSession, company_id: int, code: str, payload: GradeUpdate
) -> Grade | None:
    grade = await get_grade(db, company_id, code)
    if grade is None:
        return None
    if payload.code is not None:
        grade.code = payload.code
    if payload.name is not None:
        grade.name = payload.name
    if payload.level is not None:
        grade.level = payload.level
    if payload.can_manage_employees is not None:
        grade.can_manage_employees = payload.can_manage_employees
    if payload.can_manage_products is not None:
        grade.can_manage_products = payload.can_manage_products
    if payload.can_manage_positions is not None:
        grade.can_manage_positions = payload.can_manage_positions
    if payload.can_view_salary is not None:
        grade.can_view_salary = payload.can_view_salary
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise DuplicateGradeCodeError() from None
    await db.refresh(grade)
    return grade


async def delete_grade(db: AsyncSession, company_id: int, code: str) -> bool:
    grade = await get_grade(db, company_id, code)
    if grade is None:
        return False

    position_count = await db.scalar(
        select(func.count())
        .select_from(Position)
        .where(Position.company_id == company_id, Position.grade_code == code)
    )
    if position_count:
        raise GradeInUseError(position_count)

    await db.delete(grade)
    await db.commit()
    return True


async def seed_default_grades(db: AsyncSession, company_id: int) -> None:
    """Creates the 5 standard default grades for a newly created company — same data the
    add_grades_table_and_position_grade_id migration backfilled for pre-existing companies.
    Called from company_service.create_company() in the same transaction as the company
    itself, so a company is never left with zero grades. Does NOT commit — the caller (which
    already commits after creating the Company row) is responsible for that.
    """
    for code, name, level, mgmt_employees, mgmt_products, mgmt_positions, view_salary in DEFAULT_GRADE_SEED_DATA:
        db.add(
            Grade(
                company_id=company_id,
                code=code,
                name=name,
                level=level,
                can_manage_employees=mgmt_employees,
                can_manage_products=mgmt_products,
                can_manage_positions=mgmt_positions,
                can_view_salary=view_salary,
            )
        )
