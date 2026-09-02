from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

# company_id is intentionally absent from Create/Update — it is always derived
# server-side from get_current_company_id, never accepted from the client (IDOR prevention).


class ProductCreate(BaseModel):
    name: str
    category: str
    quantity: int = Field(default=0, ge=0)
    price: Decimal


class ProductUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    price: Decimal | None = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    category: str
    quantity: int
    price: Decimal
    created_at: datetime
    updated_at: datetime
