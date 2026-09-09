"""Grades CRUD — mirrors the Positions module exactly (see app/api/v1/grades.py and
app/services/grade_service.py): same tenant-scoping rule (company_id always server-derived,
see CLAUDE.md § Multi-Tenant Rules), same require_role_or_position_permission("can_manage_positions")
gate on writes as Positions (grades and positions are managed by the same people), and the
same delete-in-use protective pattern as PositionInUseError.

Grade's primary key is (company_id, code) — no surrogate id (see app/models/grade.py) — so
GET/PUT/DELETE /api/v1/grades/{code} identify a grade by its code, and Position references
one via grade_code, a composite foreign key (company_id, grade_code) -> grades(company_id,
code) with ON UPDATE CASCADE.

Callers use `provisioned_headers` (creates a matching Employee record first) since
get_current_employee_context() is a REQUIRED gate — see test_account_provisioning.py.
"""

from app.models.position import Position
from app.services.grade_service import DEFAULT_GRADE_SEED_DATA
from conftest import auth_headers


class TestGradeTenantIsolation:
    async def test_cannot_get_other_companys_grade(
        self, client, company_a, grade_b, provisioned_headers
    ):
        resp = await client.get(
            f"/api/v1/grades/{grade_b.code}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "GRADE_NOT_FOUND"

    async def test_cannot_update_other_companys_grade(
        self, client, company_a, grade_b, provisioned_headers
    ):
        resp = await client.put(
            f"/api/v1/grades/{grade_b.code}",
            json={"name": "Hacked"},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "GRADE_NOT_FOUND"

    async def test_cannot_delete_other_companys_grade(
        self, client, company_a, grade_b, provisioned_headers
    ):
        resp = await client.delete(
            f"/api/v1/grades/{grade_b.code}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "GRADE_NOT_FOUND"

    async def test_grade_list_excludes_other_company(
        self, client, company_a, grade_a, grade_b, provisioned_headers
    ):
        resp = await client.get(
            "/api/v1/grades", headers=await provisioned_headers("admin", company_a.id)
        )
        assert resp.status_code == 200
        items = resp.json()["data"]["items"]
        # grade_a and grade_b deliberately share the same code ("M") in different
        # companies — every returned row belonging to company_a proves exclusion here,
        # not just "grade_a's code appears somewhere in the list".
        assert all(item["company_id"] == company_a.id for item in items)
        assert any(item["code"] == grade_a.code for item in items)


class TestGradeRBAC:
    _PAYLOAD = {"code": "T", "name": "Trainee", "level": 0}

    async def test_employee_role_cannot_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/grades",
            json=self._PAYLOAD,
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_update(self, client, company_a, grade_a, provisioned_headers):
        resp = await client.put(
            f"/api/v1/grades/{grade_a.code}",
            json={"name": "Changed"},
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_cannot_delete(self, client, company_a, grade_a, provisioned_headers):
        resp = await client.delete(
            f"/api/v1/grades/{grade_a.code}",
            headers=await provisioned_headers("employee", company_a.id),
        )
        assert resp.status_code == 403

    async def test_employee_role_can_read(self, client, company_a, grade_a, provisioned_headers):
        headers = await provisioned_headers("employee", company_a.id)
        resp = await client.get("/api/v1/grades", headers=headers)
        assert resp.status_code == 200
        resp = await client.get(f"/api/v1/grades/{grade_a.code}", headers=headers)
        assert resp.status_code == 200

    async def test_hr_manager_can_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/grades",
            json=self._PAYLOAD,
            headers=await provisioned_headers("hr_manager", company_a.id),
        )
        assert resp.status_code == 201

    async def test_admin_can_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/grades",
            json=self._PAYLOAD,
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 201

    async def test_inventory_manager_cannot_create(self, client, company_a, provisioned_headers):
        resp = await client.post(
            "/api/v1/grades",
            json=self._PAYLOAD,
            headers=await provisioned_headers("inventory_manager", company_a.id),
        )
        assert resp.status_code == 403


class TestGradeCodeRename:
    async def test_renaming_a_grades_code_cascades_to_its_positions(
        self, client, company_a, grade_a, db_session, provisioned_headers
    ):
        """The whole point of the composite FK's ON UPDATE CASCADE: renaming a grade's code
        must automatically update every Position referencing it, at the database level —
        not leave them pointing at a code that no longer exists."""
        position = Position(company_id=company_a.id, name="Manager Position", grade_code=grade_a.code)
        db_session.add(position)
        await db_session.commit()
        await db_session.refresh(position)

        resp = await client.put(
            f"/api/v1/grades/{grade_a.code}",
            json={"code": "MGR"},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["code"] == "MGR"

        await db_session.refresh(position)
        assert position.grade_code == "MGR"


class TestDuplicateGradeCode:
    async def test_duplicate_code_within_same_company_rejected(
        self, client, company_a, grade_a, provisioned_headers
    ):
        resp = await client.post(
            "/api/v1/grades",
            json={"code": grade_a.code, "name": "Another Manager", "level": 5},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "GRADE_CODE_ALREADY_EXISTS"

    async def test_same_code_in_different_company_is_allowed(
        self, client, company_a, grade_b, provisioned_headers
    ):
        """grade_b already uses code "M" in company_b — company_a must be free to use the
        same code, since the primary key is scoped per-company."""
        resp = await client.post(
            "/api/v1/grades",
            json={"code": grade_b.code, "name": "Manager", "level": 2},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 201


class TestGradeInUseProtection:
    async def test_cannot_delete_grade_assigned_to_a_position(
        self, client, company_a, grade_a, db_session, provisioned_headers
    ):
        position = Position(company_id=company_a.id, name="Manager Position", grade_code=grade_a.code)
        db_session.add(position)
        await db_session.commit()

        resp = await client.delete(
            f"/api/v1/grades/{grade_a.code}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "GRADE_IN_USE"
        assert "1 position" in resp.json()["error"]["message"]

    async def test_deleting_unused_grade_succeeds(self, client, company_a, grade_a, provisioned_headers):
        resp = await client.delete(
            f"/api/v1/grades/{grade_a.code}",
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 200


class TestPositionGradeAssignmentIsTenantScoped:
    """grade_code, if provided when creating/updating a Position, must belong to a grade in
    the same company as the position — never trusted blindly (see
    app/services/position_service.py::InvalidGradeError), same rule as employee.position_id."""

    async def test_cannot_create_position_with_other_companys_grade(
        self, client, company_a, grade_b, provisioned_headers
    ):
        resp = await client.post(
            "/api/v1/positions",
            json={"name": "Suspicious Position", "grade_code": grade_b.code},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "GRADE_NOT_FOUND"

    async def test_cannot_reassign_position_to_other_companys_grade(
        self, client, company_a, position_a, grade_b, provisioned_headers
    ):
        resp = await client.put(
            f"/api/v1/positions/{position_a.id}",
            json={"grade_code": grade_b.code},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "GRADE_NOT_FOUND"

    async def test_can_create_position_with_own_companys_grade(
        self, client, company_a, grade_a, provisioned_headers
    ):
        resp = await client.post(
            "/api/v1/positions",
            json={"name": "Manager Position", "grade_code": grade_a.code},
            headers=await provisioned_headers("admin", company_a.id),
        )
        assert resp.status_code == 201
        assert resp.json()["data"]["grade_code"] == grade_a.code


class TestCompanyCreationSeedsDefaultGrades:
    async def test_new_company_gets_the_five_default_grades(self, client):
        """Follow-up to the add_grades_table_and_position_grade_id migration's one-time
        backfill: a company created AFTER that migration must not start with zero grades —
        see company_service.create_company()'s call to grade_service.seed_default_grades()."""
        create_resp = await client.post(
            "/api/v1/companies", json={"name": "Freshly Created Co"}, headers=auth_headers("super_admin")
        )
        assert create_resp.status_code == 201
        new_company_id = create_resp.json()["data"]["id"]

        list_resp = await client.get(
            "/api/v1/grades",
            headers={
                **auth_headers("super_admin"),
                "X-Acting-Company-Id": str(new_company_id),
            },
        )
        assert list_resp.status_code == 200
        items = list_resp.json()["data"]["items"]
        assert {item["code"] for item in items} == {code for code, *_ in DEFAULT_GRADE_SEED_DATA}
        assert len(items) == len(DEFAULT_GRADE_SEED_DATA)
