"""drop_can_prefix_from_position_permission_columns

Revision ID: 7c8f8c78a74b
Revises: b183c10b77ed
Create Date: 2026-09-11 14:37:18.831598

Pure rename, no data change: `positions` and `employee_permission_overrides` each drop the
"can_" prefix from their permission flag columns (can_manage_employees -> manage_employees,
etc.) — a cosmetic naming cleanup, not a behavior change. This is a breaking API change for
anyone deploying backend and frontend out of step: the Pydantic schemas and the
`GET /api/v1/me/permissions` response field names are renamed to match in the same commit
(see app/schemas/position.py, app/schemas/permissions.py,
app/schemas/employee_permission_override.py), so backend and frontend must be deployed
together for this revision.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '7c8f8c78a74b'
down_revision: Union[str, None] = 'b183c10b77ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_POSITIONS_RENAMES = [
    ("can_manage_employees", "manage_employees"),
    ("can_manage_products", "manage_products"),
    ("can_manage_positions", "manage_positions"),
    ("can_view_salary", "view_salary"),
    ("can_manage_special_permissions", "manage_special_permissions"),
]

_OVERRIDES_RENAMES = [
    ("can_manage_employees", "manage_employees"),
    ("can_manage_products", "manage_products"),
    ("can_manage_positions", "manage_positions"),
    ("can_view_salary", "view_salary"),
]


def upgrade() -> None:
    for old_name, new_name in _POSITIONS_RENAMES:
        op.alter_column("positions", old_name, new_column_name=new_name)
    for old_name, new_name in _OVERRIDES_RENAMES:
        op.alter_column("employee_permission_overrides", old_name, new_column_name=new_name)


def downgrade() -> None:
    for old_name, new_name in _OVERRIDES_RENAMES:
        op.alter_column("employee_permission_overrides", new_name, new_column_name=old_name)
    for old_name, new_name in _POSITIONS_RENAMES:
        op.alter_column("positions", new_name, new_column_name=old_name)
