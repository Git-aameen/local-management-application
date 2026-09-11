"""Tests for main.py's centralized exception handler (CLAUDE.md § Error Handling & Logging):
an unhandled exception must never leak its raw message (stack trace, DB driver text, etc.) to
the client — only the generic INTERNAL_ERROR envelope.

These tests build their own AsyncClient rather than using the shared `client` fixture: httpx's
ASGITransport defaults to re-raising unhandled exceptions (raise_app_exceptions=True), which is
correct for every other test (a real bug should fail the test, not silently become a 500), but
is exactly wrong here, since observing the 500 response body IS the point of this test.
"""

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from main import app

pytestmark = pytest.mark.asyncio

_SECRET_DB_ERROR = "password=supersecret host=db.internal connection refused"


@pytest.fixture
async def client_no_raise(db_session):
    """Same wiring as the shared `client` fixture, but lets the ASGI app's own exception
    handlers produce the response instead of having httpx re-raise the exception.
    """

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


async def test_unhandled_exception_does_not_leak_raw_message(
    client_no_raise, company_a, provisioned_headers
):
    # role=None: a provisioned tenant user with no role claim at all, matching the real
    # Auth0 app_metadata shape (CLAUDE.md § Authentication & Authorization) — the exact
    # scenario reported against this endpoint.
    headers = await provisioned_headers(None, company_a.id)
    with patch(
        "app.services.employee_service.list_employees",
        side_effect=RuntimeError(_SECRET_DB_ERROR),
    ):
        resp = await client_no_raise.get("/api/v1/employees", headers=headers)

    assert resp.status_code == 500
    body = resp.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert _SECRET_DB_ERROR not in resp.text
    assert "RuntimeError" not in resp.text
    assert "Traceback" not in resp.text
