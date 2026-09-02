"""Shared pytest fixtures for the backend test suite.

Database isolation: tests run against the real DATABASE_URL (there is no separate test
database configured), but every test's DB access is wrapped in one outer transaction that
is rolled back at the end (db_session fixture below), using SQLAlchemy's
join_transaction_mode="create_savepoint" so that even the application code's own internal
`await db.commit()` calls only complete a SAVEPOINT, never the outer transaction. Nothing a
test does is ever actually persisted. If genuine physical isolation (a dedicated test
database/instance) is ever wanted instead, that needs a separate DATABASE_URL to be
provisioned — not something available to set up here.

Auth: get_current_claims ultimately calls verify_access_token(), which fetches Auth0's real
JWKS over HTTPS to find the key that signed a token. That network round-trip is the only
part of the auth stack mocked here (via the session-scoped _patch_jwks fixture, which
replaces the JWKS lookup with a fixed test key) — the rest of verify_access_token() (RS256
signature check, audience/issuer/expiry validation) and all of get_current_company_id/
get_current_role/require_role run for real against tokens minted by make_token() below.
"""

import time
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.core.security as security_module
from app.core.config import get_settings
from app.core.security import COMPANY_ID_CLAIM, ROLE_CLAIM
from app.db.session import get_db
from app.models.company import Company
from app.models.employee import Employee
from app.models.position import Position
from app.models.product import Product
from main import app

# A dedicated engine for tests, deliberately NOT the app's module-level `engine` (see
# app/db/session.py). pytest-asyncio gives each test function its own event loop by
# default, but asyncpg connections can't be reused across event loops — the app's engine
# pools connections and would hand a test a connection opened on a previous test's
# (by-then-closed) loop. poolclass=NullPool means every checkout opens a fresh asyncpg
# connection on whichever loop is currently running, sidestepping that entirely.
_test_engine = create_async_engine(get_settings().async_database_url, poolclass=NullPool)

# --- Test signing key, used in place of Auth0's real JWKS (see _patch_jwks) ---
_TEST_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_TEST_PUBLIC_KEY = _TEST_PRIVATE_KEY.public_key()


def make_token(role: str | None, company_id: int | None = None, **extra_claims: object) -> str:
    """Mint a real, validly RS256-signed JWT carrying the given role/company_id custom
    claims, matching exactly what Auth0 would issue — for exercising endpoints as a given
    user without a real Auth0 login. role=None omits the role claim entirely (simulates a
    token that's missing it); company_id=None omits the company_id claim (simulates
    super_admin, whose tokens are never scoped to a tenant).
    """
    settings = get_settings()
    payload: dict[str, object] = {
        "iss": f"https://{settings.auth0_domain}/",
        "aud": settings.auth0_audience,
        "sub": f"test-user|{role}|{company_id}",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
    }
    if role is not None:
        payload[ROLE_CLAIM] = role
    if company_id is not None:
        payload[COMPANY_ID_CLAIM] = company_id
    payload.update(extra_claims)
    return jwt.encode(payload, _TEST_PRIVATE_KEY, algorithm="RS256")


def auth_headers(role: str | None, company_id: int | None = None, **extra_claims: object) -> dict[str, str]:
    """Authorization header for make_token() — the standard way tests authenticate as a role."""
    return {"Authorization": f"Bearer {make_token(role, company_id, **extra_claims)}"}


@pytest.fixture(autouse=True, scope="session")
def _patch_jwks():
    """Session-wide: replace the JWKS-over-HTTPS lookup with our test key. Everything else
    in the verification path (signature, audience, issuer, expiry) still runs for real.
    """
    original = security_module._jwks_client.get_signing_key_from_jwt
    security_module._jwks_client.get_signing_key_from_jwt = lambda _token: SimpleNamespace(
        key=_TEST_PUBLIC_KEY
    )
    yield
    security_module._jwks_client.get_signing_key_from_jwt = original


@pytest_asyncio.fixture
async def db_session():
    """A session bound to one outer transaction, rolled back after the test — see module
    docstring. All fixtures below use this session directly (not the app's own pool) so
    their inserts participate in the same transaction and vanish at teardown too.
    """
    async with _test_engine.connect() as connection:
        await connection.begin()
        session_factory = async_sessionmaker(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        async with session_factory() as session:
            yield session
        await connection.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    """httpx client wired to the real ASGI app, with get_db overridden to hand out the
    rollback-wrapped db_session so every request in a test shares its one transaction.
    """

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def company_a(db_session):
    company = Company(name="Test Company A")
    db_session.add(company)
    await db_session.commit()
    await db_session.refresh(company)
    return company


@pytest_asyncio.fixture
async def company_b(db_session):
    company = Company(name="Test Company B")
    db_session.add(company)
    await db_session.commit()
    await db_session.refresh(company)
    return company


@pytest_asyncio.fixture
async def position_a(db_session, company_a):
    position = Position(company_id=company_a.id, name="Position A")
    db_session.add(position)
    await db_session.commit()
    await db_session.refresh(position)
    return position


@pytest_asyncio.fixture
async def position_b(db_session, company_b):
    position = Position(company_id=company_b.id, name="Position B")
    db_session.add(position)
    await db_session.commit()
    await db_session.refresh(position)
    return position


@pytest_asyncio.fixture
async def employee_a(db_session, company_a, position_a):
    employee = Employee(
        company_id=company_a.id,
        position_id=position_a.id,
        full_name="Alice A",
        salary=Decimal("60000.00"),
        hired_at=date(2024, 1, 1),
        email="alice.a@company-a.example.com",
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)
    return employee


@pytest_asyncio.fixture
async def employee_b(db_session, company_b, position_b):
    employee = Employee(
        company_id=company_b.id,
        position_id=position_b.id,
        full_name="Bob B",
        salary=Decimal("65000.00"),
        hired_at=date(2024, 1, 1),
        email="bob.b@company-b.example.com",
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)
    return employee


@pytest_asyncio.fixture
async def product_a(db_session, company_a):
    product = Product(
        company_id=company_a.id, name="Widget A", category="Widgets", quantity=10, price=Decimal("9.99")
    )
    db_session.add(product)
    await db_session.commit()
    await db_session.refresh(product)
    return product


@pytest_asyncio.fixture
async def product_b(db_session, company_b):
    product = Product(
        company_id=company_b.id, name="Gadget B", category="Gadgets", quantity=5, price=Decimal("19.99")
    )
    db_session.add(product)
    await db_session.commit()
    await db_session.refresh(product)
    return product
