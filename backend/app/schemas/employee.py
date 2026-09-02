from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# company_id is intentionally absent from Create/Update — it is always derived
# server-side from get_current_company_id, never accepted from the client (IDOR prevention).
# position_id IS accepted from the client, but the service layer verifies it belongs
# to the same company_id before saving (see employee_service.InvalidPositionError).


class EmployeeCreate(BaseModel):
    position_id: int
    full_name: str
    salary: Decimal = Field(gt=0)
    hired_at: date
    email: EmailStr


class EmployeeUpdate(BaseModel):
    position_id: int | None = None
    full_name: str | None = None
    salary: Decimal | None = Field(default=None, gt=0)
    hired_at: date | None = None
    email: EmailStr | None = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    position_id: int
    full_name: str
    salary: Decimal
    hired_at: date
    email: str
    created_at: datetime
    updated_at: datetime
