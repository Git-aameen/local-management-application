"""Tenant isolation: a user from Company A must never be able to read, modify, or delete
Company B's data, and creating a record that references another company's data must be
rejected. See CLAUDE.md § Multi-Tenant Rules.

The caller in every test is provisioned via the `provisioned_headers` fixture (creates a
matching Employee record in company_a first) — get_current_employee_context() is now a
REQUIRED gate (see app/core/dependencies.py and tests/test_account_provisioning.py), so an
unprovisioned admin token would be rejected with 403 ACCOUNT_NOT_PROVISIONED before ever
reaching the tenant-isolation logic these tests are actually about.
"""


class TestEmployeeTenantIsolation:
    async def test_cannot_get_other_companys_employee(
        self, client, company_a, employee_b, provisioned_headers
    ):
        resp = await client.get(
            f"/api/v1/employees/{employee_b.id}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"

    async def test_cannot_update_other_companys_employee(
        self, client, company_a, employee_b, provisioned_headers
    ):
        resp = await client.put(
            f"/api/v1/employees/{employee_b.id}",
            json={"full_name": "Hacked"},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"

    async def test_cannot_delete_other_companys_employee(
        self, client, company_a, employee_b, provisioned_headers
    ):
        resp = await client.delete(
            f"/api/v1/employees/{employee_b.id}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"

    async def test_employee_list_excludes_other_company(
        self, client, company_a, employee_a, employee_b, provisioned_headers
    ):
        resp = await client.get(
            "/api/v1/employees", headers=await provisioned_headers("admin", company_a.id)
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["data"]["items"]]
        assert employee_a.id in ids
        assert employee_b.id not in ids

    async def test_cannot_create_employee_with_other_companys_position(
        self, client, company_a, position_b, provisioned_headers
    ):
        resp = await client.post(
            "/api/v1/employees",
            json={
                "position_id": position_b.id,
                "full_name": "Eve",
                "salary": 50000,
                "hired_at": "2024-01-01",
                "email": "eve@example.com",
            },
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "POSITION_NOT_FOUND"

    async def test_cannot_reassign_employee_to_other_companys_position(
        self, client, company_a, employee_a, position_b, provisioned_headers
    ):
        resp = await client.put(
            f"/api/v1/employees/{employee_a.id}",
            json={"position_id": position_b.id},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "POSITION_NOT_FOUND"


class TestProductTenantIsolation:
    async def test_cannot_get_other_companys_product(
        self, client, company_a, product_b, provisioned_headers
    ):
        resp = await client.get(
            f"/api/v1/products/{product_b.id}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "PRODUCT_NOT_FOUND"

    async def test_cannot_update_other_companys_product(
        self, client, company_a, product_b, provisioned_headers
    ):
        resp = await client.put(
            f"/api/v1/products/{product_b.id}",
            json={"quantity": 0},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "PRODUCT_NOT_FOUND"

    async def test_cannot_delete_other_companys_product(
        self, client, company_a, product_b, provisioned_headers
    ):
        resp = await client.delete(
            f"/api/v1/products/{product_b.id}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "PRODUCT_NOT_FOUND"

    async def test_product_list_excludes_other_company(
        self, client, company_a, product_a, product_b, provisioned_headers
    ):
        resp = await client.get(
            "/api/v1/products", headers=await provisioned_headers("admin", company_a.id)
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["data"]["items"]]
        assert product_a.id in ids
        assert product_b.id not in ids


class TestPositionTenantIsolation:
    async def test_cannot_get_other_companys_position(
        self, client, company_a, position_b, provisioned_headers
    ):
        resp = await client.get(
            f"/api/v1/positions/{position_b.id}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "POSITION_NOT_FOUND"

    async def test_cannot_update_other_companys_position(
        self, client, company_a, position_b, provisioned_headers
    ):
        resp = await client.put(
            f"/api/v1/positions/{position_b.id}",
            json={"name": "Hacked"},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "POSITION_NOT_FOUND"

    async def test_cannot_delete_other_companys_position(
        self, client, company_a, position_b, provisioned_headers
    ):
        resp = await client.delete(
            f"/api/v1/positions/{position_b.id}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "POSITION_NOT_FOUND"

    async def test_position_list_excludes_other_company(
        self, client, company_a, position_a, position_b, provisioned_headers
    ):
        resp = await client.get(
            "/api/v1/positions", headers=await provisioned_headers("admin", company_a.id)
        )
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["data"]["items"]]
        assert position_a.id in ids
        assert position_b.id not in ids
