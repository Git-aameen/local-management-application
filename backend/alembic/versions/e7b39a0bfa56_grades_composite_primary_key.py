"""grades_composite_primary_key

Revision ID: e7b39a0bfa56
Revises: 7a25723b0a8f
Create Date: 2026-09-08 15:58:21.655840

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7b39a0bfa56'
down_revision: Union[str, None] = '7a25723b0a8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()

    # --- capture the OLD grade_id -> (company_id, code) mapping FIRST, before any
    # structural change — grades.id and positions.grade_id both still exist at this point.
    grades_old = sa.table(
        "grades",
        sa.column("id", sa.Integer()),
        sa.column("company_id", sa.Integer()),
        sa.column("code", sa.String()),
    )
    grade_info_by_id: dict[int, tuple[int, str]] = {
        row.id: (row.company_id, row.code)
        for row in connection.execute(sa.select(grades_old.c.id, grades_old.c.company_id, grades_old.c.code))
    }

    positions_old = sa.table(
        "positions",
        sa.column("id", sa.Integer()),
        sa.column("company_id", sa.Integer()),
        sa.column("grade_id", sa.Integer()),
    )
    position_grade_id_rows = connection.execute(
        sa.select(positions_old.c.id, positions_old.c.company_id, positions_old.c.grade_id).where(
            positions_old.c.grade_id.isnot(None)
        )
    ).all()

    # --- schema step 1: drop the FK pinning positions.grade_id to grades.id. Must happen
    # before grades.id can be dropped below — Postgres refuses to drop a column something
    # else still references.
    op.drop_constraint('fk_positions_grade_id_grades', 'positions', type_='foreignkey')
    op.drop_index('ix_positions_grade_id', table_name='positions')

    # --- schema step 2: grades — surrogate `id` primary key -> composite (company_id, code).
    # uq_grades_company_id_code and ix_grades_company_id both become redundant once
    # (company_id, code) is the primary key: its own index already covers company_id-only
    # lookups (leftmost-prefix) and enforces the same uniqueness the explicit constraint did.
    op.drop_constraint('uq_grades_company_id_code', 'grades', type_='unique')
    op.drop_index('ix_grades_company_id', table_name='grades')
    op.drop_column('grades', 'id')
    op.create_primary_key('grades_pkey', 'grades', ['company_id', 'code'])

    # --- schema step 3: positions.grade_code. This name is ALREADY a physical column today
    # — but it's the OLD, long-deprecated, unmapped free-text column (values like "M1",
    # "S2" from before Grade was a real table; see app/models/position.py's docstring), not
    # the new FK column we're about to introduce. Reusing its stale data as-is would very
    # likely violate the composite FK added in step 5 below (those values don't match any
    # real grade code), so it's dropped and re-added fresh rather than left alone —
    # confirmed this is the old leftover column, not the new one, before dropping it.
    op.drop_column('positions', 'grade_code')
    op.add_column('positions', sa.Column('grade_code', sa.String(length=16), nullable=True))

    # --- data migration: backfill the fresh grade_code from the grade_id -> code mapping
    # captured at the very top, for every position that had a grade_id. A grade_id with no
    # matching grade row, or one that (unexpectedly) belongs to a different company than the
    # position itself, is left NULL and reported — never guessed at.
    positions_new = sa.table(
        "positions",
        sa.column("id", sa.Integer()),
        sa.column("grade_code", sa.String()),
    )
    backfilled = 0
    skipped: list[int] = []
    for position_id, position_company_id, grade_id in position_grade_id_rows:
        grade_info = grade_info_by_id.get(grade_id)
        if grade_info is None or grade_info[0] != position_company_id:
            skipped.append(position_id)
            continue
        _, code = grade_info
        connection.execute(
            positions_new.update().where(positions_new.c.id == position_id).values(grade_code=code)
        )
        backfilled += 1

    print(  # noqa: T201 -- deliberate migration-time diagnostic, not application logging
        f"INFO: grades_composite_primary_key backfilled grade_code for {backfilled} position(s)"
        + (
            f"; {len(skipped)} position(s) had a grade_id with no matching same-company "
            f"grade and were left grade_code=NULL: {skipped}"
            if skipped
            else ""
        )
    )

    # --- schema step 4: the composite FK itself, ON UPDATE CASCADE — the whole point of
    # this migration. Safe to add now: every non-NULL grade_code value set above is a real
    # (company_id, code) pair confirmed to exist in grades.
    op.create_index('ix_positions_company_id_grade_code', 'positions', ['company_id', 'grade_code'])
    op.create_foreign_key(
        'fk_positions_company_id_grade_code_grades',
        'positions',
        'grades',
        ['company_id', 'grade_code'],
        ['company_id', 'code'],
        onupdate='CASCADE',
    )

    op.drop_column('positions', 'grade_id')


def downgrade() -> None:
    # NOTE: best-effort schema-shape reversal only, same caveat as every prior data-carrying
    # migration in this project — the surrogate `id` values dropped above are gone for good,
    # so grade_id comes back as a bare, all-NULL column; nothing re-links a position to a
    # grade by the old numeric id. Re-adding a NOT NULL auto-increment column via ALTER TABLE
    # also needs a real sequence wired up to be fully usable again — this restores the
    # column shape, not a working SERIAL identity; treat a downgrade past this revision as
    # requiring manual follow-up, not a clean rollback.
    op.add_column('positions', sa.Column('grade_id', sa.INTEGER(), autoincrement=False, nullable=True))
    op.drop_constraint('fk_positions_company_id_grade_code_grades', 'positions', type_='foreignkey')
    op.drop_index('ix_positions_company_id_grade_code', table_name='positions')
    op.drop_column('positions', 'grade_code')
    op.add_column('positions', sa.Column('grade_code', sa.VARCHAR(length=16), autoincrement=False, nullable=True))

    op.drop_constraint('grades_pkey', 'grades', type_='primary')
    op.add_column('grades', sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False))
    op.create_primary_key('grades_pkey', 'grades', ['id'])
    op.create_unique_constraint('uq_grades_company_id_code', 'grades', ['company_id', 'code'])
    op.create_index('ix_grades_company_id', 'grades', ['company_id'], unique=False)

    op.create_index('ix_positions_grade_id', 'positions', ['grade_id'], unique=False)
    op.create_foreign_key('fk_positions_grade_id_grades', 'positions', 'grades', ['grade_id'], ['id'])
