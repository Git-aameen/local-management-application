"""RBAC enforcement: each role can only do what CLAUDE.md § Authentication & Authorization
says it can, mirrored exactly by each router's require_role([...]) — see
app/api/v1/{companies,employees,positions,products}.py.
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
    async def test_employee_role_cannot_create(self, client, company_a, position_a):
        resp = await client.post(
            "/api/v1/employees",
            json={**_EMPLOYEE_PAYLOAD, "position_id": position_a.id},
            headers=auth_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_update(self, client, company_a, employee_a):
        resp = await client.put(
            f"/api/v1/employees/{employee_a.id}",
            json={"full_name": "Changed"},
            headers=auth_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_delete(self, client, company_a, employee_a):
        resp = await client.delete(
            f"/api/v1/employees/{employee_a.id}", headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 403

    async def test_employee_role_can_read(self, client, company_a, employee_a):
        resp = await client.get("/api/v1/employees", headers=auth_headers("employee", company_a.id))
        assert resp.status_code == 200
        resp = await client.get(
            f"/api/v1/employees/{employee_a.id}", headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 200

    async def test_hr_manager_can_create(self, client, company_a, position_a):
        resp = await client.post(
            "/api/v1/employees",
            json={**_EMPLOYEE_PAYLOAD, "position_id": position_a.id},
            headers=auth_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 201

    async def test_admin_can_create(self, client, company_a, position_a):
        resp = await client.post(
            "/api/v1/employees",
            json={**_EMPLOYEE_PAYLOAD, "position_id": position_a.id},
            headers=auth_headers("admin", company_a.id),
        )
        assert resp.status_code == 201

    async def test_inventory_manager_cannot_create(self, client, company_a, position_a):
        resp = await client.post(
            "/api/v1/employees",
            json={**_EMPLOYEE_PAYLOAD, "position_id": position_a.id},
            headers=auth_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 403

    async def test_inventory_manager_cannot_delete(self, client, company_a, employee_a):
        resp = await client.delete(
            f"/api/v1/employees/{employee_a.id}",
            headers=auth_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 403


class TestProductRBAC:
    async def test_employee_role_cannot_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/products", json=_PRODUCT_PAYLOAD, headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_update(self, client, company_a, product_a):
        resp = await client.put(
            f"/api/v1/products/{product_a.id}",
            json={"quantity": 1},
            headers=auth_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_delete(self, client, company_a, product_a):
        resp = await client.delete(
            f"/api/v1/products/{product_a.id}", headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 403

    async def test_employee_role_can_read(self, client, company_a, product_a):
        resp = await client.get("/api/v1/products", headers=auth_headers("employee", company_a.id))
        assert resp.status_code == 200
        resp = await client.get(
            f"/api/v1/products/{product_a.id}", headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 200

    async def test_inventory_manager_can_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/products",
            json=_PRODUCT_PAYLOAD,
            headers=auth_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 201

    async def test_admin_can_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/products", json=_PRODUCT_PAYLOAD, headers=auth_headers("admin", company_a.id)
        )
        assert resp.status_code == 201

    async def test_hr_manager_cannot_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/products", json=_PRODUCT_PAYLOAD, headers=auth_headers("hr_manager", company_a.id)
        )
        assert resp.status_code == 403

    async def test_hr_manager_cannot_delete(self, client, company_a, product_a):
        resp = await client.delete(
            f"/api/v1/products/{product_a.id}", headers=auth_headers("hr_manager", company_a.id)
        )
        assert resp.status_code == 403


class TestPositionRBAC:
    async def test_employee_role_cannot_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/positions", json=_POSITION_PAYLOAD, headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_update(self, client, company_a, position_a):
        resp = await client.put(
            f"/api/v1/positions/{position_a.id}",
            json={"name": "Changed"},
            headers=auth_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_delete(self, client, company_a, position_a):
        resp = await client.delete(
            f"/api/v1/positions/{position_a.id}", headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 403

    async def test_employee_role_can_read(self, client, company_a, position_a):
        resp = await client.get("/api/v1/positions", headers=auth_headers("employee", company_a.id))
        assert resp.status_code == 200
        resp = await client.get(
            f"/api/v1/positions/{position_a.id}", headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 200

    async def test_hr_manager_can_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/positions", json=_POSITION_PAYLOAD, headers=auth_headers("hr_manager", company_a.id)
        )
        assert resp.status_code == 201

    async def test_admin_can_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/positions", json=_POSITION_PAYLOAD, headers=auth_headers("admin", company_a.id)
        )
        assert resp.status_code == 201

    async def test_inventory_manager_cannot_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/positions",
            json=_POSITION_PAYLOAD,
            headers=auth_headers("inventory_manager", company_a.id),
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

    async def test_regular_admin_cannot_create_company(self, client, company_a):
        """The security fix: a per-company admin must not be able to create tenants."""
        resp = await client.post(
            "/api/v1/companies", json={"name": "Should Fail"}, headers=auth_headers("admin", company_a.id)
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize("path", ["/api/v1/employees", "/api/v1/products", "/api/v1/positions"])
    async def test_super_admin_gets_clean_error_on_tenant_scoped_endpoints(self, client, path):
        resp = await client.get(path, headers=auth_headers("super_admin"))
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
