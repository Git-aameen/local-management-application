"""Business rule validation: quantity/salary positivity constraints, and the
position-in-use delete guard (see app/schemas/{employee,product}.py and
app/services/position_service.py::PositionInUseError).
"""

from app.models.position import Position
from conftest import auth_headers


class TestProductValidation:
    async def test_negative_quantity_rejected_on_create(self, client, company_a):
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Bad", "category": "X", "quantity": -1, "price": 9.99},
            headers=auth_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_negative_quantity_rejected_on_update(self, client, company_a, product_a):
        resp = await client.put(
            f"/api/v1/products/{product_a.id}",
            json={"quantity": -5},
            headers=auth_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_zero_quantity_is_allowed(self, client, company_a):
        """Unlike salary, zero stock is a legitimate state (out of stock)."""
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Out Of Stock", "category": "X", "quantity": 0, "price": 9.99},
            headers=auth_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 201


class TestEmployeeValidation:
    async def test_negative_salary_rejected_on_create(self, client, company_a, position_a):
        resp = await client.post(
            "/api/v1/employees",
            json={
                "position_id": position_a.id,
                "full_name": "Bad Salary",
                "salary": -1000,
                "hired_at": "2024-01-01",
                "email": "bad-salary@example.com",
            },
            headers=auth_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_zero_salary_rejected_on_create(self, client, company_a, position_a):
        """Unlike quantity, salary=0 isn't a meaningful state — must be strictly positive."""
        resp = await client.post(
            "/api/v1/employees",
            json={
                "position_id": position_a.id,
                "full_name": "Zero Salary",
                "salary": 0,
                "hired_at": "2024-01-01",
                "email": "zero-salary@example.com",
            },
            headers=auth_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_negative_salary_rejected_on_update(self, client, company_a, employee_a):
        resp = await client.put(
            f"/api/v1/employees/{employee_a.id}",
            json={"salary": -500},
            headers=auth_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_validation_error_never_includes_the_submitted_salary_value(
        self, client, company_a, position_a
    ):
        """Sensitive-data check (CLAUDE.md § Sensitive Data Handling): the error message
        must describe the constraint, never echo back the actual number the caller sent.
        """
        resp = await client.post(
            "/api/v1/employees",
            json={
                "position_id": position_a.id,
                "full_name": "Leak Check",
                "salary": -123456,
                "hired_at": "2024-01-01",
                "email": "leak-check@example.com",
            },
            headers=auth_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 400
        assert "123456" not in resp.text


class TestPositionDeletion:
    async def test_deleting_position_with_employees_rejected(
        self, client, company_a, position_a, employee_a
    ):
        resp = await client.delete(
            f"/api/v1/positions/{position_a.id}", headers=auth_headers("hr_manager", company_a.id)
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "POSITION_IN_USE"
        assert "1 employee" in resp.json()["error"]["message"]

    async def test_position_is_not_deleted_when_rejected(
        self, client, company_a, position_a, employee_a
    ):
        resp = await client.delete(
            f"/api/v1/positions/{position_a.id}", headers=auth_headers("hr_manager", company_a.id)
        )
        assert resp.status_code == 409

        # confirm it's still there and still usable, not partially deleted
        get_resp = await client.get(
            f"/api/v1/positions/{position_a.id}", headers=auth_headers("hr_manager", company_a.id)
        )
        assert get_resp.status_code == 200

    async def test_deleting_unused_position_succeeds(self, client, company_a, db_session):
        position = Position(company_id=company_a.id, name="Unused Position")
        db_session.add(position)
        await db_session.commit()
        await db_session.refresh(position)

        resp = await client.delete(
            f"/api/v1/positions/{position.id}", headers=auth_headers("hr_manager", company_a.id)
        )
        assert resp.status_code == 200
