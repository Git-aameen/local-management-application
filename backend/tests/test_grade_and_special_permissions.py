"""Grade-derived and special-permission-derived permissions — additive to role-based RBAC,
combined via OR (CLAUDE.md § Authentication & Authorization):

    effective_permission = (system role allows) OR (employee's position's grade allows)
                            OR (employee's EmployeeSpecialPermission record allows, if any)

See app/core/dependencies.py::get_current_employee_context. A Position carries no
permissions of its own anymore (see app/models/position.py) — only a grade_code, half of a
composite foreign key to grades(company_id, code) — so every test here builds its own
Position/Grade/EmployeeSpecialPermission combination rather than relying on Position-level
flags the way this suite used to before that restructuring.

Also covers GET/PUT /api/v1/employees/{id}/special-permissions, restricted to a caller who
is either system role "admin" or holds an Admin-grade ("A") position — a completely
different, simpler OR (app/core/dependencies.py::get_can_manage_special_permissions), not to
be confused with the additive OR above.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.core.security import EMAIL_CLAIM
from app.models.employee import Employee
from app.models.employee_special_permission import EmployeeSpecialPermission
from app.models.grade import Grade
from app.models.position import Position
from conftest import auth_headers


async def _make_graded_employee(
    db_session,
    company_id: int,
    role: str,
    *,
    grade_code: str | None = None,
    grade_can_manage_employees: bool = False,
    grade_can_manage_products: bool = False,
    grade_can_manage_positions: bool = False,
    grade_can_view_salary: bool = False,
    special_permissions: dict[str, bool] | None = None,
) -> tuple[Employee, dict[str, str]]:
    """Builds one Employee, in a Position with an optional Grade (only created if
    grade_code is given) and an optional EmployeeSpecialPermission record, then returns
    (employee, auth_headers(...)) for a token matching that employee's email."""
    if grade_code is not None:
        grade = Grade(
            company_id=company_id,
            code=grade_code,
            name=grade_code,
            level=1,
            can_manage_employees=grade_can_manage_employees,
            can_manage_products=grade_can_manage_products,
            can_manage_positions=grade_can_manage_positions,
            can_view_salary=grade_can_view_salary,
        )
        db_session.add(grade)
        await db_session.commit()
        await db_session.refresh(grade)

    position = Position(company_id=company_id, name="Test Position", grade_code=grade_code)
    db_session.add(position)
    await db_session.commit()
    await db_session.refresh(position)

    employee = Employee(
        company_id=company_id,
        position_id=position.id,
        full_name="Test Employee",
        salary=Decimal("40000.00"),
        hired_at=date(2024, 1, 1),
        email=f"grade-test-{uuid4().hex[:10]}@example.com",
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)

    if special_permissions:
        db_session.add(EmployeeSpecialPermission(employee_id=employee.id, **special_permissions))
        await db_session.commit()

    headers = auth_headers(role, company_id, **{EMAIL_CLAIM: employee.email})
    return employee, headers


class TestGradeGrantsExtraAccess:
    async def test_employee_role_with_grade_can_manage_products_can_manage_products(
        self, client, company_a, db_session
    ):
        """A plain 'employee' role, on a position graded with can_manage_products, can act
        on products — even though the "employee" role alone never could (see
        test_rbac.py::TestProductRBAC::test_employee_role_cannot_create)."""
        _, headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="S", grade_can_manage_products=True
        )
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 201

    async def test_same_grade_does_not_grant_employee_management(
        self, client, company_a, db_session
    ):
        """A grade granting can_manage_products must NOT also grant employee/position
        management — the OR is per-permission, not "any true flag unlocks everything"."""
        employee, headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="S", grade_can_manage_products=True
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

    async def test_admin_role_unaffected_by_lack_of_grade(
        self, client, company_a, provisioned_headers
    ):
        """The primary role-based path must keep working exactly as before, regardless of
        the caller's own Position having no grade at all (matches every existing RBAC test)
        — caller must still be a provisioned Employee, though, since
        get_current_employee_context() is a REQUIRED gate (test_account_provisioning.py)."""
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 201

    async def test_editing_a_grade_immediately_changes_effective_permission(
        self, client, company_a, db_session
    ):
        """Unlike the old per-position copy, a Grade's flags are re-evaluated live — editing
        one immediately changes every Position (and Employee) linked to it."""
        employee, headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="S", grade_can_manage_products=False
        )
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 403

        position = await db_session.get(Position, employee.position_id)
        grade = await db_session.get(Grade, (position.company_id, position.grade_code))
        grade.can_manage_products = True
        await db_session.commit()

        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 201


class TestMePermissionsEndpoint:
    async def test_reflects_grade_grant_for_employee_role(self, client, company_a, db_session):
        _, headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="S", grade_can_manage_products=True
        )
        resp = await client.get("/api/v1/me/permissions", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["role"] == "employee"
        assert data["can_manage_employees"] is False
        assert data["can_manage_products"] is True
        assert data["can_manage_positions"] is False
        assert data["can_view_salary"] is False

    async def test_admin_role_all_true_regardless_of_grade(
        self, client, company_a, provisioned_headers
    ):
        resp = await client.get(
            "/api/v1/me/permissions", headers=await provisioned_headers("admin", company_a.id)
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["can_manage_employees"] is True
        assert data["can_manage_products"] is True
        assert data["can_manage_positions"] is True
        assert data["can_view_salary"] is True
        assert data["can_manage_special_permissions"] is True

    async def test_super_admin_no_crash_all_false(self, client):
        """super_admin has no company_id claim by design — get_current_employee_context()
        must degrade gracefully (all False), not raise, per CLAUDE.md's fail-clean rule."""
        resp = await client.get("/api/v1/me/permissions", headers=auth_headers("super_admin"))
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["role"] == "super_admin"
        assert data["can_manage_employees"] is False
        assert data["can_manage_products"] is False
        assert data["can_manage_positions"] is False
        assert data["can_view_salary"] is False
        assert data["can_manage_special_permissions"] is False

    async def test_unprovisioned_employee_rejected_not_all_false(self, client, company_a):
        """A token with a real role/company_id but no matching Employee record used to get
        an all-False EmployeePermissions back (optional/fail-open); get_current_employee_context()
        is now a REQUIRED gate, so this is a 403 ACCOUNT_NOT_PROVISIONED instead — see
        test_account_provisioning.py for the full cross-endpoint coverage of this rule."""
        resp = await client.get(
            "/api/v1/me/permissions", headers=auth_headers("employee", company_a.id)
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "ACCOUNT_NOT_PROVISIONED"


class TestSalaryVisibilityPermission:
    """can_view_salary OR logic: (system role is admin/hr_manager) OR (the caller's own
    position's grade allows it) OR (the caller's own special_permissions record allows it).
    Salary masking itself is a frontend concern (the API always returns the field — see
    app/schemas/employee.py) — /me/permissions is what the frontend consults to decide
    whether to render it, so that's what these tests check.
    """

    async def test_manager_style_grade_without_salary_grant_cannot_view_salary(
        self, client, company_a, db_session
    ):
        _, headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="M", grade_can_view_salary=False
        )
        resp = await client.get("/api/v1/me/permissions", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["can_view_salary"] is False

    async def test_hr_style_grade_can_view_salary_regardless_of_system_role(
        self, client, company_a, db_session
    ):
        _, headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="HR", grade_can_view_salary=True
        )
        resp = await client.get("/api/v1/me/permissions", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["can_view_salary"] is True

    async def test_hr_manager_role_can_view_salary_even_without_a_grant(
        self, client, company_a, db_session
    ):
        _, headers = await _make_graded_employee(
            db_session, company_a.id, "hr_manager", grade_code="S", grade_can_view_salary=False
        )
        resp = await client.get("/api/v1/me/permissions", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["can_view_salary"] is True


class TestSpecialPermissionsOrLogic:
    """The third additive source: an employee's own EmployeeSpecialPermission record, on top
    of role and grade."""

    async def test_special_permission_grants_extra_access_beyond_role_and_grade(
        self, client, company_a, db_session
    ):
        _, headers = await _make_graded_employee(
            db_session,
            company_a.id,
            "employee",
            grade_code="S",
            grade_can_manage_products=False,
            special_permissions={"can_manage_products": True},
        )
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 201

    async def test_without_special_permission_record_access_stays_denied(
        self, client, company_a, db_session
    ):
        _, headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="S", grade_can_manage_products=False
        )
        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 403


class TestSpecialPermissionsEndpointAccess:
    """GET/PUT /api/v1/employees/{id}/special-permissions is gated by
    get_can_manage_special_permissions: system role "admin" OR an Admin-grade ("A") position
    — a simple OR, either alone sufficient (app/core/dependencies.py)."""

    async def test_admin_role_can_access_with_non_admin_grade_position(
        self, client, company_a, db_session
    ):
        caller, caller_headers = await _make_graded_employee(
            db_session, company_a.id, "admin", grade_code="C"
        )
        target, _ = await _make_graded_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions", headers=caller_headers
        )
        assert resp.status_code == 200

    async def test_admin_role_can_access_with_no_position_grade_at_all(
        self, client, company_a, provisioned_headers, db_session
    ):
        target, _ = await _make_graded_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 200

    async def test_admin_grade_position_grants_access_regardless_of_system_role(
        self, client, company_a, db_session
    ):
        caller, caller_headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="A"
        )
        target, _ = await _make_graded_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions", headers=caller_headers
        )
        assert resp.status_code == 200

    async def test_neither_admin_role_nor_admin_grade_is_rejected(
        self, client, company_a, db_session
    ):
        """hr_manager role with a Chief-style ("C") grade position — neither condition
        applies, even though "C" happens to grant full can_manage_* flags elsewhere."""
        caller, caller_headers = await _make_graded_employee(
            db_session,
            company_a.id,
            "hr_manager",
            grade_code="C",
            grade_can_manage_employees=True,
            grade_can_manage_products=True,
            grade_can_manage_positions=True,
            grade_can_view_salary=True,
        )
        target, _ = await _make_graded_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions", headers=caller_headers
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "FORBIDDEN"

    async def test_put_is_gated_the_same_way_as_get(self, client, company_a, db_session):
        caller, caller_headers = await _make_graded_employee(
            db_session, company_a.id, "hr_manager", grade_code="C"
        )
        target, _ = await _make_graded_employee(db_session, company_a.id, "employee")
        resp = await client.put(
            f"/api/v1/employees/{target.id}/special-permissions",
            json={"can_manage_products": True},
            headers=caller_headers,
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "FORBIDDEN"


class TestSpecialPermissionsTenantIsolation:
    async def test_cannot_set_special_permissions_for_employee_in_other_company(
        self, client, company_a, company_b, provisioned_headers, db_session
    ):
        target, _ = await _make_graded_employee(db_session, company_b.id, "employee")
        resp = await client.put(
            f"/api/v1/employees/{target.id}/special-permissions",
            json={"can_manage_products": True},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"

    async def test_cannot_get_special_permissions_for_employee_in_other_company(
        self, client, company_a, company_b, provisioned_headers, db_session
    ):
        target, _ = await _make_graded_employee(db_session, company_b.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"


class TestSpecialPermissionsCrud:
    async def test_get_with_no_existing_record_returns_all_false(
        self, client, company_a, provisioned_headers, db_session
    ):
        target, _ = await _make_graded_employee(db_session, company_a.id, "employee")
        resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == {
            "employee_id": target.id,
            "can_manage_employees": False,
            "can_manage_products": False,
            "can_manage_positions": False,
            "can_view_salary": False,
        }

    async def test_put_creates_then_get_reflects_it(
        self, client, company_a, provisioned_headers, db_session
    ):
        target, _ = await _make_graded_employee(db_session, company_a.id, "employee")
        headers = await provisioned_headers("admin", company_a.id)

        put_resp = await client.put(
            f"/api/v1/employees/{target.id}/special-permissions",
            json={"can_manage_products": True},
            headers=headers,
        )
        assert put_resp.status_code == 200
        assert put_resp.json()["data"]["can_manage_products"] is True
        assert put_resp.json()["data"]["can_manage_employees"] is False

        get_resp = await client.get(
            f"/api/v1/employees/{target.id}/special-permissions", headers=headers
        )
        assert get_resp.json()["data"]["can_manage_products"] is True

    async def test_put_never_revokes_role_or_grade_access(self, client, company_a, db_session):
        """Setting every special_permissions flag to False must not take away what the
        caller's grade already grants — this table is purely additive."""
        target, headers = await _make_graded_employee(
            db_session, company_a.id, "employee", grade_code="S", grade_can_manage_products=True
        )
        admin_headers = auth_headers("admin", company_a.id)

        # An admin explicitly zeroes out this employee's special permissions.
        await client.put(
            f"/api/v1/employees/{target.id}/special-permissions",
            json={
                "can_manage_employees": False,
                "can_manage_products": False,
                "can_manage_positions": False,
                "can_view_salary": False,
            },
            headers=admin_headers,
        )

        resp = await client.post(
            "/api/v1/products",
            json={"name": "Widget", "category": "X", "quantity": 1, "price": 1.0},
            headers=headers,
        )
        assert resp.status_code == 201
