"""get_current_employee_context() is a REQUIRED, fail-closed gate (see
app/core/dependencies.py): a JWT with a genuine role and company_id claim is not, by itself,
enough to access any company data — the token's email must also match a real Employee row
within that company_id, or every protected endpoint rejects the request with
403 ACCOUNT_NOT_PROVISIONED before its own handler (or any role/tenant-isolation check) ever
runs. See CLAUDE.md § Multi-Tenant Rules.

super_admin is the one exception: it carries no company_id claim and has no Employee record
by design, so it skips this check entirely (see TestSuperAdminBypassesProvisioningCheck
below) and can still manage the Companies resource.
"""

import jwt as pyjwt
import pytest

from app.core.security import EMAIL_CLAIM
from conftest import auth_headers

_UNPROVISIONED_CASES = [
    ("GET", "/api/v1/employees", None),
    ("POST", "/api/v1/employees", {}),
    ("GET", "/api/v1/products", None),
    ("POST", "/api/v1/products", {}),
    ("GET", "/api/v1/positions", None),
    ("POST", "/api/v1/positions", {}),
    ("GET", "/api/v1/me/permissions", None),
]


class TestUnprovisionedAccountRejected:
    @pytest.mark.parametrize("method,path,body", _UNPROVISIONED_CASES)
    async def test_valid_token_without_matching_employee_gets_403(
        self, client, company_a, method, path, body
    ):
        """A structurally valid token — real role, real company_id — with no Employee row
        matching its email in that company must be rejected on every company-scoped
        endpoint, GET as well as POST: an unprovisioned account must not be able to read
        company data either, not just write it."""
        resp = await client.request(
            method, path, json=body, headers=auth_headers("admin", company_a.id)
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "ACCOUNT_NOT_PROVISIONED"

    async def test_employee_provisioned_in_a_different_company_still_rejected(
        self, client, company_a, company_b, provisioned_headers
    ):
        """The Employee lookup is scoped by the token's company_id, not just by email — a
        token claiming Company A, using the same email as someone who is provisioned only
        in Company B, must still be rejected as unprovisioned."""
        headers_b = await provisioned_headers("admin", company_b.id)

        resp = await client.get("/api/v1/employees", headers=headers_b)
        assert resp.status_code == 200  # control: this caller works fine within company_b

        token = headers_b["Authorization"].removeprefix("Bearer ")
        email = pyjwt.decode(token, options={"verify_signature": False})[EMAIL_CLAIM]
        resp = await client.get(
            "/api/v1/employees", headers=auth_headers("admin", company_a.id, **{EMAIL_CLAIM: email})
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "ACCOUNT_NOT_PROVISIONED"

    async def test_provisioned_employee_can_access_company_scoped_data(
        self, client, company_a, provisioned_headers
    ):
        """Sanity check / control case: a genuinely provisioned account is let through."""
        resp = await client.get(
            "/api/v1/employees", headers=await provisioned_headers("admin", company_a.id)
        )
        assert resp.status_code == 200


class TestSuperAdminBypassesProvisioningCheck:
    async def test_super_admin_can_list_companies_with_no_employee_record(self, client):
        resp = await client.get("/api/v1/companies", headers=auth_headers("super_admin"))
        assert resp.status_code == 200

    async def test_super_admin_can_create_company_with_no_employee_record(self, client):
        resp = await client.post(
            "/api/v1/companies", json={"name": "Bootstrap Co"}, headers=auth_headers("super_admin")
        )
        assert resp.status_code == 201
