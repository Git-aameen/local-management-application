from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# company_id is intentionally absent from Create/Update — it is always derived server-side
# from get_current_company_id, never accepted from the client (IDOR prevention), same rule
# as Positions/Employees/Products.


class GradeCreate(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    name: str = Field(min_length=1, max_length=255)
    level: int
    can_manage_employees: bool = False
    can_manage_products: bool = False
    can_manage_positions: bool = False
    can_view_salary: bool = False


class GradeUpdate(BaseModel):
    # Changing `code` changes half of this row's own primary key (company_id, code) — see
    # app/models/grade.py. That's allowed: the composite foreign key on Position
    # (company_id, grade_code) is declared ON UPDATE CASCADE, so Postgres itself propagates
    # a renamed code to every Position referencing it. No application-level rename routine
    # is needed or exists.
    code: str | None = Field(default=None, min_length=1, max_length=16)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    level: int | None = None
    can_manage_employees: bool | None = None
    can_manage_products: bool | None = None
    can_manage_positions: bool | None = None
    can_view_salary: bool | None = None


class GradeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # No surrogate id — (company_id, code) is the primary key (see app/models/grade.py).
    # `code` is what GET/PUT/DELETE /api/v1/grades/{code} identifies a grade by.
    company_id: int
    code: str
    name: str
    level: int
    can_manage_employees: bool
    can_manage_products: bool
    can_manage_positions: bool
    can_view_salary: bool
    created_at: datetime
