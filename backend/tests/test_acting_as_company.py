"""X-Acting-Company-Id ("act as company" mode for super_admin) — see
app/core/dependencies.py::get_acting_company_id/get_effective_company_id/get_effective_role
and CLAUDE.md § Authentication & Authorization.

The header is honored ONLY when the token's own role claim is exactly "super_admin". For
every one of the four tenant roles it must be silently ignored — their own JWT company_id
claim keeps being what's enforced, with no way for the header to redirect them to another
company's data. This file's first class exists specifically to prove that never breaks.
"""

from conftest import auth_headers

ACTING_HEADER = "X-Acting-Company-Id"


class TestNonSuperAdminHeaderIsIgnored:
    async def test_read_scoped_to_own_company_not_header_value(
        self, client, company_a, company_b, employee_a, employee_b, provisioned_headers
    ):
        headers = await provisioned_headers("admin", company_a.id)
        headers[ACTING_HEADER] = str(company_b.id)

        resp = await client.get("/api/v1/employees", headers=headers)
        assert resp.status_code == 200
        ids = [item["id"] for item in resp.json()["data"]["items"]]
        assert employee_a.id in ids
        assert employee_b.id not in ids

    async def test_created_record_belongs_to_own_company_not_header_value(
        self, client, company_a, company_b, position_a, provisioned_headers
    ):
        headers = await provisioned_headers("hr_manager", company_a.id, manage_employees=True)
        headers[ACTING_HEADER] = str(company_b.id)

        resp = await client.post(
            "/api/v1/employees",
            json={
                "position_id": position_a.id,
                "full_name": "Ignored Header Test",
                "salary": 50000,
                "hired_at": "2024-01-01",
                "email": "ignored-header@example.com",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["company_id"] == company_a.id

    async def test_cannot_use_header_to_reach_other_companys_record_by_id(
        self, client, company_a, company_b, employee_b, provisioned_headers
    ):
        """A malicious admin in Company A pointing the header at Company B must still get
        404, not the record — the header must never function as an alternate IDOR path."""
        headers = await provisioned_headers("admin", company_a.id)
        headers[ACTING_HEADER] = str(company_b.id)

        resp = await client.get(f"/api/v1/employees/{employee_b.id}", headers=headers)
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"

    async def test_my_summary_reflects_own_company_not_header_value(
        self, client, company_a, company_b, employee_b, provisioned_headers
    ):
        headers = await provisioned_headers("employee", company_a.id)
        headers[ACTING_HEADER] = str(company_b.id)

        resp = await client.get("/api/v1/me/summary", headers=headers)
        assert resp.status_code == 200
        # provisioned_headers itself creates one Position + one Employee in company_a, and
        # employee_b lives in company_b — if the header were honored this would be >= 2.
        assert resp.json()["data"]["employee_count"] == 1


class TestSuperAdminActingAsCompany:
    async def test_can_create_employee_for_acting_company(self, client, company_a, position_a):
        resp = await client.post(
            "/api/v1/employees",
            json={
                "position_id": position_a.id,
                "full_name": "Acted Hire",
                "salary": 60000,
                "hired_at": "2024-01-01",
                "email": "acted-hire@example.com",
            },
            headers={**auth_headers("super_admin"), ACTING_HEADER: str(company_a.id)},
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["company_id"] == company_a.id

    async def test_can_update_employee_for_acting_company(self, client, company_a, employee_a):
        resp = await client.put(
            f"/api/v1/employees/{employee_a.id}",
            json={"full_name": "Renamed By Super Admin"},
            headers={**auth_headers("super_admin"), ACTING_HEADER: str(company_a.id)},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["full_name"] == "Renamed By Super Admin"

    async def test_can_delete_product_for_acting_company(self, client, company_a, product_a):
        resp = await client.delete(
            f"/api/v1/products/{product_a.id}",
            headers={**auth_headers("super_admin"), ACTING_HEADER: str(company_a.id)},
        )
        assert resp.status_code == 200

    async def test_can_create_position_for_acting_company(self, client, company_a):
        resp = await client.post(
            "/api/v1/positions",
            json={"name": "Acted Position"},
            headers={**auth_headers("super_admin"), ACTING_HEADER: str(company_a.id)},
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["company_id"] == company_a.id

    async def test_without_header_still_gets_clean_tenant_error(self, client):
        """Regression guard: acting mode must be opt-in per request, not a standing side
        effect — a super_admin who sends no header keeps getting the pre-existing clean
        403 on tenant-scoped endpoints."""
        resp = await client.get("/api/v1/employees", headers=auth_headers("super_admin"))
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "SUPER_ADMIN_NO_TENANT_ACCESS"

    async def test_malformed_header_falls_back_to_clean_tenant_error(self, client):
        resp = await client.get(
            "/api/v1/employees",
            headers={**auth_headers("super_admin"), ACTING_HEADER: "not-a-number"},
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "SUPER_ADMIN_NO_TENANT_ACCESS"

    async def test_my_permissions_reports_all_true_while_acting(self, client, company_a):
        """get_current_employee_context() always reports all-False for a super_admin (it's
        never a real employee of the acted-on company, by design) — GET /api/v1/me/permissions
        must not blindly forward that while acting, or the frontend would hide every manage
        control an acting super_admin can actually use (see require_position_permission's own
        acting-mode bypass, which this mirrors)."""
        resp = await client.get(
            "/api/v1/me/permissions",
            headers={**auth_headers("super_admin"), ACTING_HEADER: str(company_a.id)},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["manage_employees"] is True
        assert data["manage_products"] is True
        assert data["manage_positions"] is True
        assert data["view_salary"] is True

    async def test_my_summary_reflects_acting_company(
        self, client, company_a, employee_a, position_a, product_a
    ):
        resp = await client.get(
            "/api/v1/me/summary",
            headers={**auth_headers("super_admin"), ACTING_HEADER: str(company_a.id)},
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == {
            "employee_count": 1,
            "position_count": 1,
            "product_count": 1,
        }


class TestMySummaryForOrdinaryCallers:
    async def test_reflects_own_company_counts(
        self, client, company_a, employee_a, position_a, product_a, provisioned_headers
    ):
        headers = await provisioned_headers("admin", company_a.id)
        resp = await client.get("/api/v1/me/summary", headers=headers)
        assert resp.status_code == 200
        # provisioned_headers adds one more Position + Employee of its own on top of the
        # employee_a/position_a fixtures requested above.
        assert resp.json()["data"] == {
            "employee_count": 2,
            "position_count": 2,
            "product_count": 1,
        }

    async def test_excludes_other_companys_records(
        self, client, company_a, company_b, employee_b, product_b, provisioned_headers
    ):
        headers = await provisioned_headers("employee", company_a.id)
        resp = await client.get("/api/v1/me/summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["employee_count"] == 1  # only provisioned_headers' own caller
        assert data["product_count"] == 0
