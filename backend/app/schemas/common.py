from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    """Standard response envelope used by every endpoint (see CLAUDE.md § API Response Format)."""

    success: bool = True
    data: T | None = None
    error: ErrorDetail | None = None


class PaginatedResponse(BaseModel, Generic[T]):
    """Pagination metadata wrapper for list endpoints, nested inside ApiResponse.data."""

    items: list[T]
    total: int
    page: int
    page_size: int
