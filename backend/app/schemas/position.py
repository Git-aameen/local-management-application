from datetime import datetime

from pydantic import BaseModel, ConfigDict

# company_id is intentionally absent from Create/Update — it is always derived
# server-side from get_current_company_id, never accepted from the client (IDOR prevention).


class PositionCreate(BaseModel):
    name: str


class PositionUpdate(BaseModel):
    name: str | None = None


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    created_at: datetime
