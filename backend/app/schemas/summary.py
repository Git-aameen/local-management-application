from pydantic import BaseModel


class CompanySummaryResponse(BaseModel):
    """Simple record counts for the current company context — see GET /api/v1/me/summary.
    "Current company context" is the acting-as company for a super_admin using
    X-Acting-Company-Id, otherwise the caller's own company_id claim (see
    app/core/dependencies.py::get_effective_company_id).
    """

    employee_count: int
    position_count: int
    product_count: int
