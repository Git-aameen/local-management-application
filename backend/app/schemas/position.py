from datetime import datetime

from pydantic import BaseModel, ConfigDict

# company_id is intentionally absent from Create/Update — it is always derived
# server-side from get_current_company_id, never accepted from the client (IDOR prevention).
#
# A Position carries its own five permission flags directly (see app/models/position.py and
# CLAUDE.md § Authentication & Authorization) — there is no more shared "Grade" concept to
# reference; each Position is configured independently, right here.


class PositionCreate(BaseModel):
    name: str
    manage_employees: bool = False
    manage_products: bool = False
    manage_positions: bool = False
    view_salary: bool = False
    manage_special_permissions: bool = False


class PositionUpdate(BaseModel):
    name: str | None = None
    manage_employees: bool | None = None
    manage_products: bool | None = None
    manage_positions: bool | None = None
    view_salary: bool | None = None
    manage_special_permissions: bool | None = None


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    manage_employees: bool
    manage_products: bool
    manage_positions: bool
    view_salary: bool
    manage_special_permissions: bool
    created_at: datetime
