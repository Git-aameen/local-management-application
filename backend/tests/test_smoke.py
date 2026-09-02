"""Sanity checks for the fixture infrastructure itself (rollback isolation, JWT minting)."""

from sqlalchemy import select

from app.models.company import Company
from conftest import auth_headers


async def test_client_and_auth_headers_work(client, company_a):
    resp = await client.get("/api/v1/companies", headers=auth_headers("super_admin"))
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()["data"]["items"]]
    assert company_a.name in names


async def test_no_token_is_401(client):
    resp = await client.get("/api/v1/companies")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "MISSING_TOKEN"


async def test_fixtures_do_not_leak_across_tests(db_session):
    """If this ever finds more than one row, the rollback isolation is broken and every
    other test in this suite is silently polluting the real database.
    """
    result = await db_session.execute(select(Company).where(Company.name.like("Test Company%")))
    rows = result.scalars().all()
    assert rows == []
