"""merge_grade_into_position_and_drop_grades_table

Revision ID: b183c10b77ed
Revises: e7b39a0bfa56
Create Date: 2026-09-11 12:07:30.322645

Second architecture change (see CLAUDE.md § Authentication & Authorization): Grade is
retired entirely. A Position now carries its own five permission flags directly
(can_manage_employees/products/positions, can_view_salary, can_manage_special_permissions)
instead of referencing a Grade row live via grade_code — there is no more "shared tier"
concept, just per-Position settings. can_manage_special_permissions is new: it replaces the
old "Admin-grade ('A') position" check that used to gate
GET/PUT /api/v1/employees/{id}/special-permissions (see app/core/dependencies.py).

This migration backfills the new columns from each Position's CURRENT Grade before dropping
the grades table, so no one's effective permissions change as a direct result of upgrading —
only the *storage* moves from "live reference to a shared Grade row" to "a plain value on
the Position itself" (editing a Grade after this no longer has any effect, since Grade no
longer exists; editing a Position's own flags is the only way to change them going forward).

Also renames employee_special_permissions -> employee_permission_overrides and makes its
four flag columns nullable: NULL now means "no override for this flag, defer entirely to the
Position" (a real, distinct state), rather than every row always carrying four concrete
booleans. Existing explicit `false` values are left as-is (still a real "false", not
converted to NULL) since NULL and false already resolve identically for anyone reading this
table with the additive OR logic already in place.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b183c10b77ed'
down_revision: Union[str, None] = 'e7b39a0bfa56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The grade code that used to grant "Admin-grade position" access to
# GET/PUT /api/v1/employees/{id}/special-permissions (app/core/dependencies.py's old
# ADMIN_GRADE_CODE) — used here only to backfill can_manage_special_permissions for
# positions that were graded "A", preserving today's effective access one last time.
_ADMIN_GRADE_CODE = "A"


def upgrade() -> None:
    # ### schema step 1: give positions its own five permission columns ###
    op.add_column('positions', sa.Column('can_manage_employees', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('positions', sa.Column('can_manage_products', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('positions', sa.Column('can_manage_positions', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('positions', sa.Column('can_view_salary', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('positions', sa.Column('can_manage_special_permissions', sa.Boolean(), server_default='false', nullable=False))

    # --- data migration: backfill the new columns from each position's CURRENT grade_code,
    # before grades is dropped below ---
    connection = op.get_bind()

    positions_table = sa.table(
        "positions",
        sa.column("id", sa.Integer()),
        sa.column("company_id", sa.Integer()),
        sa.column("grade_code", sa.String()),
        sa.column("can_manage_employees", sa.Boolean()),
        sa.column("can_manage_products", sa.Boolean()),
        sa.column("can_manage_positions", sa.Boolean()),
        sa.column("can_view_salary", sa.Boolean()),
        sa.column("can_manage_special_permissions", sa.Boolean()),
    )
    grades_table = sa.table(
        "grades",
        sa.column("company_id", sa.Integer()),
        sa.column("code", sa.String()),
        sa.column("can_manage_employees", sa.Boolean()),
        sa.column("can_manage_products", sa.Boolean()),
        sa.column("can_manage_positions", sa.Boolean()),
        sa.column("can_view_salary", sa.Boolean()),
    )

    grade_flags_by_company_and_code: dict[tuple[int, str], tuple[bool, bool, bool, bool]] = {
        (row.company_id, row.code): (
            row.can_manage_employees,
            row.can_manage_products,
            row.can_manage_positions,
            row.can_view_salary,
        )
        for row in connection.execute(
            sa.select(
                grades_table.c.company_id,
                grades_table.c.code,
                grades_table.c.can_manage_employees,
                grades_table.c.can_manage_products,
                grades_table.c.can_manage_positions,
                grades_table.c.can_view_salary,
            )
        )
    }

    graded_positions = connection.execute(
        sa.select(positions_table.c.id, positions_table.c.company_id, positions_table.c.grade_code).where(
            positions_table.c.grade_code.isnot(None)
        )
    ).all()

    all_flags_false_count = 0
    for position_id, company_id, grade_code in graded_positions:
        flags = grade_flags_by_company_and_code.get((company_id, grade_code), (False, False, False, False))
        can_manage_special_permissions = grade_code == _ADMIN_GRADE_CODE
        if not any(flags) and not can_manage_special_permissions:
            all_flags_false_count += 1
        connection.execute(
            positions_table.update()
            .where(positions_table.c.id == position_id)
            .values(
                can_manage_employees=flags[0],
                can_manage_products=flags[1],
                can_manage_positions=flags[2],
                can_view_salary=flags[3],
                can_manage_special_permissions=can_manage_special_permissions,
            )
        )

    # Ungraded positions (grade_code IS NULL) are left at the column defaults (all False) —
    # they never granted anything before either.
    print(  # noqa: T201 -- deliberate migration-time diagnostic, not application logging
        f"INFO: merge_grade_into_position_and_drop_grades_table backfilled {len(graded_positions)} "
        f"graded position(s); {all_flags_false_count} of them ended up with all five flags "
        "False (their grade granted nothing) — review if that count looks unexpectedly high."
    )

    # ### schema step 2: drop the now-obsolete grade_code column and the grades table ###
    op.drop_constraint('fk_positions_company_id_grade_code_grades', 'positions', type_='foreignkey')
    op.drop_index('ix_positions_company_id_grade_code', table_name='positions')
    op.drop_column('positions', 'grade_code')
    op.drop_table('grades')

    # ### schema step 3: employee_special_permissions -> employee_permission_overrides,
    # with its four flag columns made nullable (NULL = no override, a distinct state from
    # an explicit False) ###
    op.rename_table('employee_special_permissions', 'employee_permission_overrides')
    op.alter_column('employee_permission_overrides', 'can_manage_employees', existing_type=sa.Boolean(), nullable=True, server_default=None)
    op.alter_column('employee_permission_overrides', 'can_manage_products', existing_type=sa.Boolean(), nullable=True, server_default=None)
    op.alter_column('employee_permission_overrides', 'can_manage_positions', existing_type=sa.Boolean(), nullable=True, server_default=None)
    op.alter_column('employee_permission_overrides', 'can_view_salary', existing_type=sa.Boolean(), nullable=True, server_default=None)


def downgrade() -> None:
    # Best-effort schema-shape reversal only, same caveat as every prior data-carrying
    # migration in this project (see e.g. grades_composite_primary_key's downgrade): grade
    # code/name/level values dropped by the upgrade above are gone for good, so `grades`
    # comes back empty and `positions.grade_code` comes back all-NULL — nothing re-links a
    # position to a grade identity that no longer exists anywhere. Treat downgrading past
    # this revision as requiring manual follow-up, not a clean rollback.
    connection = op.get_bind()

    # NULL would violate the NOT NULL constraint being restored below — collapse to False,
    # matching how NULL already behaved under the additive OR logic while this was nullable.
    overrides_table = sa.table(
        "employee_permission_overrides",
        sa.column("can_manage_employees", sa.Boolean()),
        sa.column("can_manage_products", sa.Boolean()),
        sa.column("can_manage_positions", sa.Boolean()),
        sa.column("can_view_salary", sa.Boolean()),
    )
    for column in ("can_manage_employees", "can_manage_products", "can_manage_positions", "can_view_salary"):
        connection.execute(
            overrides_table.update().where(getattr(overrides_table.c, column).is_(None)).values(**{column: False})
        )
    op.alter_column('employee_permission_overrides', 'can_view_salary', existing_type=sa.Boolean(), nullable=False, server_default='false')
    op.alter_column('employee_permission_overrides', 'can_manage_positions', existing_type=sa.Boolean(), nullable=False, server_default='false')
    op.alter_column('employee_permission_overrides', 'can_manage_products', existing_type=sa.Boolean(), nullable=False, server_default='false')
    op.alter_column('employee_permission_overrides', 'can_manage_employees', existing_type=sa.Boolean(), nullable=False, server_default='false')
    op.rename_table('employee_permission_overrides', 'employee_special_permissions')

    op.create_table(
        'grades',
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=16), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('can_manage_employees', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('can_manage_products', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('can_manage_positions', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('can_view_salary', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id']),
        sa.PrimaryKeyConstraint('company_id', 'code'),
    )
    op.add_column('positions', sa.Column('grade_code', sa.String(length=16), nullable=True))
    op.create_index('ix_positions_company_id_grade_code', 'positions', ['company_id', 'grade_code'])
    op.create_foreign_key(
        'fk_positions_company_id_grade_code_grades',
        'positions',
        'grades',
        ['company_id', 'grade_code'],
        ['company_id', 'code'],
        onupdate='CASCADE',
    )

    op.drop_column('positions', 'can_manage_special_permissions')
    op.drop_column('positions', 'can_view_salary')
    op.drop_column('positions', 'can_manage_positions')
    op.drop_column('positions', 'can_manage_products')
    op.drop_column('positions', 'can_manage_employees')
