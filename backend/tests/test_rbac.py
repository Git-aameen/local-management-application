"""RBAC enforcement: each role can only do what CLAUDE.md § Authentication & Authorization
says it can, mirrored exactly by each router's require_role([...]) — see
app/api/v1/{companies,employees,positions,products}.py.

Every tenant-role caller here is provisioned via the `provisioned_headers` fixture (creates
a matching Employee record first) — get_current_employee_context() is now a REQUIRED gate
(see app/core/dependencies.py and tests/test_account_provisioning.py), so an unprovisioned
caller would be rejected with 403 ACCOUNT_NOT_PROVISIONED before ever reaching the role
checks these tests are actually about.
"""

import pytest

from conftest import auth_headers

_EMPLOYEE_PAYLOAD = {
    "full_name": "New Hire",
    "salary": 50000,
    "hired_at": "2024-01-01",
    "email": "new-hire@example.com",
}
_PRODUCT_PAYLOAD = {"name": "New Product", "category": "Test", "quantity": 5, "price": 9.99}
_POSITION_PAYLOAD = {"name": "New Position"}


class TestEmployeeRBAC:
    async def test_employee_role_cannot_create(self, client, company_a, position_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/employees",
            json={**_EMPLOYEE_PAYLOAD, "position_id": position_a.id},
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_update(self, client, company_a, employee_a, provisioned_headers):
        resp = await client.put(
            f"/api/v1/employees/{employee_a.id}",
            json={"full_name": "Changed"},
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_delete(self, client, company_a, employee_a, provisioned_headers):
        resp = await client.delete(
            f"/api/v1/employees/{employee_a.id}",
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_can_read(self, client, company_a, employee_a, provisioned_headers):
        headers = await provisioned_headers("employee", company_a.id)
        resp = await client.get("/api/v1/employees", headers=headers)
        assert resp.status_code == 200
        resp = await client.get(f"/api/v1/employees/{employee_a.id}", headers=headers)
        assert resp.status_code == 200

    async def test_hr_manager_can_create(self, client, company_a, position_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/employees",
            json={**_EMPLOYEE_PAYLOAD, "position_id": position_a.id},
            headers=await provisioned_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 201

    async def test_admin_can_create(self, client, company_a, position_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/employees",
            json={**_EMPLOYEE_PAYLOAD, "position_id": position_a.id},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 201

    async def test_inventory_manager_cannot_create(
        self, client, company_a, position_a, provisioned_headers
    ):
        resp = await client.post(
            "/api/v1/employees",
            json={**_EMPLOYEE_PAYLOAD, "position_id": position_a.id},
            headers=await provisioned_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 403

    async def test_inventory_manager_cannot_delete(
        self, client, company_a, employee_a, provisioned_headers
    ):
        resp = await client.delete(
            f"/api/v1/employees/{employee_a.id}",
            headers=await provisioned_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 403


class TestProductRBAC:
    async def test_employee_role_cannot_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/products",
            json=_PRODUCT_PAYLOAD,
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_update(self, client, company_a, product_a, provisioned_headers):
        resp = await client.put(
            f"/api/v1/products/{product_a.id}",
            json={"quantity": 1},
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_delete(self, client, company_a, product_a, provisioned_headers):
        resp = await client.delete(
            f"/api/v1/products/{product_a.id}",
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_can_read(self, client, company_a, product_a, provisioned_headers):
        headers = await provisioned_headers("employee", company_a.id)
        resp = await client.get("/api/v1/products", headers=headers)
        assert resp.status_code == 200
        resp = await client.get(f"/api/v1/products/{product_a.id}", headers=headers)
        assert resp.status_code == 200

    async def test_inventory_manager_can_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/products",
            json=_PRODUCT_PAYLOAD,
            headers=await provisioned_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 201

    async def test_admin_can_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/products",
            json=_PRODUCT_PAYLOAD,
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 201

    async def test_hr_manager_cannot_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/products",
            json=_PRODUCT_PAYLOAD,
            headers=await provisioned_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 403

    async def test_hr_manager_cannot_delete(self, client, company_a, product_a, provisioned_headers):
        resp = await client.delete(
            f"/api/v1/products/{product_a.id}",
            headers=await provisioned_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 403


class TestPositionRBAC:
    async def test_employee_role_cannot_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/positions",
            json=_POSITION_PAYLOAD,
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_update(self, client, company_a, position_a, provisioned_headers):
        resp = await client.put(
            f"/api/v1/positions/{position_a.id}",
            json={"name": "Changed"},
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_delete(self, client, company_a, position_a, provisioned_headers):
        resp = await client.delete(
            f"/api/v1/positions/{position_a.id}",
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_can_read(self, client, company_a, position_a, provisioned_headers):
        headers = await provisioned_headers("employee", company_a.id)
        resp = await client.get("/api/v1/positions", headers=headers)
        assert resp.status_code == 200
        resp = await client.get(f"/api/v1/positions/{position_a.id}", headers=headers)
        assert resp.status_code == 200

    async def test_hr_manager_can_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/positions",
            json=_POSITION_PAYLOAD,
            headers=await provisioned_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 201

    async def test_admin_can_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/positions",
            json=_POSITION_PAYLOAD,
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 201

    async def test_inventory_manager_cannot_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/positions",
            json=_POSITION_PAYLOAD,
            headers=await provisioned_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 403


class TestSuperAdminRBAC:
    async def test_super_admin_can_create_company(self, client):
        resp = await client.post(
            "/api/v1/companies", json={"name": "New Co"}, headers=auth_headers("super_admin")
        )
        assert resp.status_code == 201

    async def test_super_admin_can_update_company(self, client, company_a):
        resp = await client.put(
            f"/api/v1/companies/{company_a.id}",
            json={"name": "Renamed"},
            headers=auth_headers("super_admin"),
        )
        assert resp.status_code == 200

    async def test_regular_admin_cannot_create_company(self, client, company_a, provisioned_headers):
        """The security fix: a per-company admin — even a fully provisioned one — must not
        be able to create tenants."""
        resp = await client.post(
            "/api/v1/companies",
            json={"name": "Should Fail"},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "FORBIDDEN"

    @pytest.mark.parametrize("path", ["/api/v1/employees", "/api/v1/products", "/api/v1/positions"])
    async def test_super_admin_gets_clean_error_on_tenant_scoped_endpoints(self, client, path):
        resp = await client.get(path, headers=auth_headers("super_admin"))
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "SUPER_ADMIN_NO_TENANT_ACCESS"


class TestCompanyReadsAreSuperAdminOnly:
    """GET on the Companies resource is a platform-operator concern too, not just POST/PUT
    (see app/api/v1/companies.py) — a regular tenant role must not be able to browse other
    companies' names by listing or guessing ids. A tenant user's OWN company info is served
    by GET /api/v1/me/company instead (see TestMyCompanyEndpoint below)."""

    @pytest.mark.parametrize("role", ["admin", "hr_manager", "inventory_manager", "employee"])
    async def test_regular_role_cannot_list_companies(
        self, client, company_a, role, provisioned_headers
    ):
        resp = await client.get(
            "/api/v1/companies", headers=await provisioned_headers(role, company_a.id)
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "FORBIDDEN"

    async def test_regular_admin_cannot_get_company_by_id(
        self, client, company_a, provisioned_headers
    ):
        resp = await client.get(
            f"/api/v1/companies/{company_a.id}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "FORBIDDEN"


class TestMyCompanyEndpoint:
    async def test_provisioned_employee_gets_own_company(
        self, client, company_a, provisioned_headers
    ):
        resp = await client.get(
            "/api/v1/me/company", headers=await provisioned_headers("employee", company_a.id)
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["id"] == company_a.id
        assert data["name"] == company_a.name

    async def test_super_admin_gets_clean_error(self, client):
        resp = await client.get("/api/v1/me/company", headers=auth_headers("super_admin"))
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "SUPER_ADMIN_NO_TENANT_ACCESS"


class TestNoToken:
    @pytest.mark.parametrize(
        "method,path",
        [
            ("GET", "/api/v1/employees"),
            ("GET", "/api/v1/products"),
            ("GET", "/api/v1/positions"),
            ("GET", "/api/v1/companies"),
            ("POST", "/api/v1/employees"),
            ("POST", "/api/v1/products"),
            ("POST", "/api/v1/positions"),
            ("POST", "/api/v1/companies"),
        ],
    )
    async def test_no_token_gets_401(self, client, method, path):
        resp = await client.request(method, path, json={} if method == "POST" else None)
        assert resp.status_code == 401
        assert resp.json()["error"]["code"] == "MISSING_TOKEN"
