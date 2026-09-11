"""Position-derived permissions — the SOLE source of truth for Employees/Positions/Products
manage access, and for GET/PUT /api/v1/employees/{id}/special-permissions (CLAUDE.md §
Authentication & Authorization, app/core/dependencies.py::require_position_permission):

    effective_permission = (employee's own Position allows it)
                            OR (employee's own EmployeePermissionOverride allows it, if any
                                — manage_special_permissions has no override counterpart)

The JWT role plays NO part in this formula at all — see
TestPositionGrantsAccess::test_role_alone_is_not_sufficient_without_a_position_grant and
TestMePermissionsEndpoint::test_admin_role_alone_shows_all_false_without_a_grant, which prove
exactly that. Grade has been retired entirely — a Position carries its own five permission
flags directly now (see app/models/position.py); every test here builds its own Position/
EmployeePermissionOverride combination.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.core.security import EMAIL_CLAIM
from app.models.employee import Employee
from app.models.employee_permission_override import EmployeePermissionOverride
from app.models.position import Position
from conftest import auth_headers


async def _make_employee(
    db_session,
    company_id: int,
    role: str,
    *,
    manage_employees: bool = False,
    manage_products: bool = False,
    manage_positions: bool = False,
    view_salary: bool = False,
    manage_special_permissions: bool = False,
    override: dict[str, bool] | None = None,
) -> tuple[Employee, dict[str, str]]:
    """Builds one Employee on a Position with the given flags, and an optional
    EmployeePermissionOverride record, then returns (employee, auth_headers(...)) for a
    token matching that employee's email. `role` is just a label here — it grants nothing
    for any of these endpoints; it's carried through the token only because auth_headers()
    requires *some* value, and because a real Auth0-issued tenant token could still contain
    a stray role claim that the backend now simply ignores (see get_current_role)."""
    position = Position(
        company_id=company_id,
        name="Test Position",
        manage_employees=manage_employees,
        manage_products=manage_products,
        manage_positions=manage_positions,
        view_salary=view_salary,
        manage_special_permissions=manage_special_permissions,
    )
    db_session.add(position)
    await db_session.commit()
    await db_session.refresh(position)

    employee = Employee(
        company_id=company_id,
        position_id=position.id,
        full_name="Test Employee",
        salary=Decimal("40000.00"),
        hired_at=date(2024, 1, 1),
        email=f"position-test-{uuid4().hex[:10]}@example.com",
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)

    if override:
        db_session.add(EmployeePermissionOverride(employee_id=employee.id, **override))
        await db_session.commit()

    headers = auth_headers(role, company_id, **{EMAIL_CLAIM: employee.email})
    return employee, headers


class TestPositionGrantsAccess:
    async def test_employee_role_with_position_flag_manage_products(
        self, client, company_a, db_session
    ):
        """A plain 'employee' role, on a position with manage_products=True, can act on
        products — even though the "employee" role alone never could (see
        test_rbac.py::TestProductRBAC::test_role_alone_grants_nothing_...)."""
        _, headers = await _make_employee(db_session, company_a.id, "employee", manage_products=True)
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 201

    async def test_one_flag_does_not_grant_other_modules(self, client, company_a, db_session):
        """A position with manage_products=True must NOT also grant employee/position
        management — each flag is checked independently."""
        employee, headers = await _make_employee(
            db_session, company_a.id, "employee", manage_products=True
        )

        resp = await client.post(
            "/api/v1/employees",
            json={
                "position_id": employee.position_id,
                "full_name": "Someone",
                "salary": 50000,
                "hired_at": "2024-01-01",
                "email": "someone@example.com",
            },
            headers=headers,
        )
        assert resp.status_code == 403

        resp = await client.post("/api/v1/positions", json={"name": "New Pos"}, headers=headers)
        assert resp.status_code == 403

    async def test_role_alone_is_not_sufficient_without_a_position_grant(
        self, client, company_a, provisioned_headers
    ):
        """The role-based path is gone entirely: an "admin" whose own Position grants
        nothing is rejected, exactly like any other role — see
        test_rbac.py::TestProductRBAC::test_role_alone_grants_nothing_... for the equivalent
        coverage across the other modules. Caller must still be a provisioned Employee to
        even reach this check (get_current_employee_context, test_account_provisioning.py)."""
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "POSITION_PERMISSION_DENIED"

    async def test_editing_a_shared_positions_flag_changes_effective_permission_for_everyone_on_it(
        self, client, company_a, db_session
    ):
        """Two employees on the SAME Position — flipping that Position's own flag changes
        both employees' effective access immediately, since it's read fresh on every
        request, not cached anywhere."""
        employee_one, headers_one = await _make_employee(db_session, company_a.id, "employee")
        position = await db_session.get(Position, employee_one.position_id)
        employee_two = Employee(
            company_id=company_a.id,
            position_id=position.id,
            full_name="Second Employee",
            salary=Decimal("41000.00"),
            hired_at=date(2024, 1, 1),
            email=f"position-test-{uuid4().hex[:10]}@example.com",
        )
        db_session.add(employee_two)
        await db_session.commit()
        headers_two = auth_headers("employee", company_a.id, **{EMAIL_CLAIM: employee_two.email})

        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers_one,
        )
        assert resp.status_code == 403

        position.manage_products = True
        await db_session.commit()

        for headers in (headers_one, headers_two):
            resp = await client.post(
                "/api/v1/products",
                json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
                headers=headers,
            )
            assert resp.status_code == 201


class TestMePermissionsEndpoint:
    async def test_reflects_position_grant_for_employee_role(self, client, company_a, db_session):
        _, headers = await _make_employee(db_session, company_a.id, "employee", manage_products=True)
        resp = await client.get("/api/v1/me/permissions", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["manage_employees"] is False
        assert data["manage_products"] is True
        assert data["manage_positions"] is False
        assert data["view_salary"] is False

    async def test_admin_role_alone_shows_all_false_without_a_grant(
        self, client, company_a, provisioned_headers
    ):
        resp = await client.get(
            "/api/v1/me/permissions", headers=await provisioned_headers("admin", company_a.id)
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["manage_employees"] is False
        assert data["manage_products"] is False
        assert data["manage_positions"] is False
        assert data["view_salary"] is False
        assert data["manage_special_permissions"] is False

    async def test_super_admin_no_crash_all_false(self, client):
        """super_admin has no company_id claim by design — get_current_employee_context()
        must degrade gracefully (all False), not raise, per CLAUDE.md's fail-clean rule."""
        resp = await client.get("/api/v1/me/permissions", headers=auth_headers("super_admin"))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["role"] == "super_admin"
        assert data["manage_employees"] is False
        assert data["manage_products"] is False
        assert data["manage_positions"] is False
        assert data["view_salary"] is False
        assert data["manage_special_permissions"] is False

    async def test_unprovisioned_employee_rejected_not_all_false(self, client, company_a):
        """A token with a real company_id but no matching Employee record is rejected with
        403 ACCOUNT_NOT_PROVISIONED — see test_account_provisioning.py for the full
        cross-endpoint coverage of this rule."""
        resp = await client.get(
            "/api/v1/me/permissions", headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "ACCOUNT_NOT_PROVISIONED"


class TestSalaryVisibilityPermission:
    """view_salary OR logic: (the caller's own Position allows it) OR (the caller's own
    EmployeePermissionOverride allows it). Salary masking itself is a frontend concern (the
    API always returns the field — see app/schemas/employee.py) — /me/permissions is what
    the frontend consults to decide whether to render it, so that's what these tests check.
    """

    async def test_position_without_salary_grant_cannot_view_salary(self, client, company_a, db_session):
        _, headers = await _make_employee(db_session, company_a.id, "employee", view_salary=False)
        resp = await client.get("/api/v1/me/permissions", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["view_salary"] is False

    async def test_position_with_salary_grant_view_salary(self, client, company_a, db_session):
        _, headers = await _make_employee(db_session, company_a.id, "employee", view_salary=True)
        resp = await client.get("/api/v1/me/permissions", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["view_salary"] is True

    async def test_hr_manager_role_alone_cannot_view_salary_without_a_grant(
        self, client, company_a, db_session
    ):
        """Role plays no part in this decision at all now — an "hr_manager" whose Position
        doesn't grant view_salary can't see it either."""
        _, headers = await _make_employee(db_session, company_a.id, "hr_manager", view_salary=False)
        resp = await client.get("/api/v1/me/permissions", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["view_salary"] is False


class TestPermissionOverrideOrLogic:
    """The second additive source: an employee's own EmployeePermissionOverride record, on
    top of their Position."""

    async def test_override_grants_extra_access_beyond_position(self, client, company_a, db_session):
        _, headers = await _make_employee(
            db_session,
            company_a.id,
            "employee",
            manage_products=False,
            override={"manage_products": True},
        )
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 201

    async def test_without_an_override_record_access_stays_denied(self, client, company_a, db_session):
        _, headers = await _make_employee(db_session, company_a.id, "employee", manage_products=False)
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 403


class TestSpecialPermissionsEndpointAccess:
    """GET/PUT /api/v1/employees/{id}/special-permissions is gated by
    require_position_permission("manage_special_permissions") — just another Position
    flag now, no role involved and no per-employee override for this one flag (see
    app/models/employee_permission_override.py)."""

    async def test_position_grant_can_access(self, client, company_a, db_session):
        caller, caller_headers = await _make_employee(
            db_session, company_a.id, "employee", manage_special_permissions=True
        )
        target, _ = await _make_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions", headers=caller_headers
        )
        assert resp.status_code == 200

    async def test_no_grant_is_rejected_even_for_admin_role(
        self, client, company_a, provisioned_headers, db_session
    ):
        target, _ = await _make_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "POSITION_PERMISSION_DENIED"

    async def test_put_is_gated_the_same_way_as_get(self, client, company_a, db_session):
        caller, caller_headers = await _make_employee(db_session, company_a.id, "hr_manager")
        target, _ = await _make_employee(db_session, company_a.id, "employee")
        resp = await client.put(
            f"/api/v1/employees/{target.id}/special-permissions",
            json={"manage_products": True},
            headers=caller_headers,
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "POSITION_PERMISSION_DENIED"

    async def test_acting_as_company_super_admin_can_access_regardless_of_position(
        self, client, company_a, db_session
    ):
        target, _ = await _make_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions",
            headers={**auth_headers("super_admin"), "X-Acting-Company-Id": str(company_a.id)},
        )
        assert resp.status_code == 200


class TestSpecialPermissionsTenantIsolation:
    async def test_cannot_set_override_for_employee_in_other_company(
        self, client, company_a, company_b, provisioned_headers, db_session
    ):
        target, _ = await _make_employee(db_session, company_b.id, "employee")
        resp = await client.put(
            f"/api/v1/employees/{target.id}/special-permissions",
            json={"manage_products": True},
            headers=await provisioned_headers("admin", company_a.id, manage_special_permissions=True),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"

    async def test_cannot_get_override_for_employee_in_other_company(
        self, client, company_a, company_b, provisioned_headers, db_session
    ):
        target, _ = await _make_employee(db_session, company_b.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions",
            headers=await provisioned_headers("admin", company_a.id, manage_special_permissions=True),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"


class TestPermissionOverrideCrud:
    async def test_get_with_no_existing_override_returns_all_none(
        self, client, company_a, provisioned_headers, db_session
    ):
        target, _ = await _make_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions",
            headers=await provisioned_headers("admin", company_a.id, manage_special_permissions=True),
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == {
            "employee_id": target.id,
            "manage_employees": None,
            "manage_products": None,
            "manage_positions": None,
            "view_salary": None,
        }

    async def test_put_creates_then_get_reflects_it(
        self, client, company_a, provisioned_headers, db_session
    ):
        target, _ = await _make_employee(db_session, company_a.id, "employee")
        headers = await provisioned_headers("admin", company_a.id, manage_special_permissions=True)

        put_resp = await client.put(
            f"/api/v1/employees/{target.id}/special-permissions",
            json={"manage_products": True},
            headers=headers,
        )
        assert put_resp.status_code == 200
        assert put_resp.json()["data"]["manage_products"] is True
        assert put_resp.json()["data"]["manage_employees"] is None

        get_resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions", headers=headers
        )
        assert get_resp.json()["data"]["manage_products"] is True

    async def test_put_never_revokes_position_access(self, client, company_a, db_session):
        """Clearing every override flag back to null must not take away what the caller's
        own Position already grants — this table is purely additive."""
        target, headers = await _make_employee(db_session, company_a.id, "employee", manage_products=True)
        admin_headers = auth_headers("admin", company_a.id)

        # An admin explicitly clears this employee's overrides (no-op here, since none of
        # these were ever set — just confirming the PUT itself never subtracts anything).
        await client.put(
            f"/api/v1/employees/{target.id}/special-permissions",
            json={
                "manage_employees": None,
                "manage_products": None,
                "manage_positions": None,
                "view_salary": None,
            },
            headers=admin_headers,
        )

        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 201
