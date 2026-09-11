# Project Overview

**Local Management Application** — a backoffice system for managing back-office data across multiple companies (multi-tenant SaaS).
Core modules:
- **HR / Employee Management** — employee data, salary, position, personal info
- **Inventory / Product Management** — product categories, stock quantity, product info

Each company (tenant) can only see its own data. Cross-tenant data leakage is strictly forbidden.

# Tech Stack

- **Frontend:** React.js + TypeScript
- **Backend:** Python + FastAPI
- **Database:** PostgreSQL (recommended: Supabase or Neon — free tier)
- **ORM:** SQLAlchemy + Alembic (for migrations)
- **Auth:** OAuth2 (via Auth0)
- **Multi-tenancy strategy:** Shared table + `company_id` column (row-level isolation)

# Project Structure

```
/backend    # FastAPI app (see ARCHITECTURE.md for the full folder breakdown)
/frontend   # React app (see ARCHITECTURE.md for the full folder breakdown)
```

# Commands

**Backend**
- `uvicorn main:app --reload` — run dev server
- `alembic revision --autogenerate -m "message"` — create a migration
- `alembic upgrade head` — apply migrations
- `pytest` — run unit tests
- `ruff check .` — lint code

**Frontend**
- `npm run dev` — run dev server
- `npm run build` — build for production
- `npm run test` — run unit tests
- `npm run lint` — check code style

# Multi-Tenant Rules (critical)

- Every table storing company-specific data **must have a `company_id` column** (foreign key to the `companies` table)
- Every query fetching employees/products **must always be filtered by the current user's `company_id`**. Never run a query without filtering by `company_id`.
- Use a FastAPI dependency (e.g. `get_current_company`) to extract `company_id` from the JWT/session and pass it through to the service layer every time. Never accept `company_id` from the client's request body or query parameters directly (this prevents IDOR — a user forging a company_id to view another company's data)
- A valid JWT with a real role and `company_id` claim is **not sufficient on its own** to access any company data. Every non-`super_admin` user must also have a matching `Employee` record (looked up by the token's email, within the token's `company_id`) — this is enforced fail-closed, at the API layer, via a required router-level dependency (`get_current_employee_context` in `app/core/dependencies.py`, wired on every protected router in `main.py`) that rejects any request with no matching Employee row with `403 ACCOUNT_NOT_PROVISIONED`, before the endpoint handler or any tenant-isolation logic ever runs. This applies to reads as well as writes — an unprovisioned account must not be able to see company data at all, not just be blocked from changing it. `super_admin` is exempt (it has no `company_id` claim and no Employee record by design, so it skips this check entirely). This is a separate, broader mechanism than Position-permission checks (see Authentication & Authorization below) — it's a prerequisite gate (are you a real employee at all), not the thing that decides what you're allowed to manage.
- Write dedicated tests for tenant isolation, e.g. "a user from Company A must not be able to fetch Company B's data"

# Authentication & Authorization

- Use **OAuth2 via Auth0** — the backend validates JWT tokens issued by Auth0 (do not implement the OAuth flow yourself)
- **Auth0 custom claims, second architecture change: role is a super_admin-only signal now.** A tenant user's token carries ONLY `https://localmanagementapp.com/company_id` and `https://localmanagementapp.com/email` — **no role claim at all**. Only a `super_admin` token carries `https://localmanagementapp.com/role = "super_admin"`; that's the one and only role value that exists anywhere in this system now. `get_current_role()` (`app/core/dependencies.py`) reflects this: it returns the role claim as-is (`None` for every tenant user), never raises for a missing claim, and the only meaningful comparison anywhere in the codebase is `role == "super_admin"`. This is configured via an Auth0 Action on login — see ARCHITECTURE.md § Authentication Flow for exactly what that Action must do; changing it is a manual step in the Auth0 dashboard, not something this codebase can do on its own.
- **Position permission is the sole source of truth for managing Employees/Positions/Products** (Grade has been retired — see below). `require_position_permission(permission)` (`app/core/dependencies.py`) checks ONLY the caller's own Position for the named flag (`manage_employees`, `manage_products`, `manage_positions`, `view_salary`, `manage_special_permissions`) — **role grants nothing here**, on any of these modules' `POST`/`PUT`/`DELETE` endpoints, nor on `GET`/`PUT /api/v1/employees/{id}/special-permissions`. A `403 POSITION_PERMISSION_DENIED` means the caller's own Position doesn't grant that flag, full stop. `GET` (read) endpoints for Employees/Positions/Products remain open to any provisioned tenant user, unrelated to any permission flag — do not add permission checks to reads.
- **Grade has been retired entirely** — a Position now carries its own five permission flags directly (`manage_employees`, `manage_products`, `manage_positions`, `view_salary`, `manage_special_permissions`), set directly on the Position form. There is no more shared "tier" a Position points to; editing one Position's flags affects only that Position.
- **Per-employee permission override**: an individual employee needing more than their own Position allows is granted that via `EmployeePermissionOverride` (`employee_permission_overrides` table) — purely additive (`effective = Position allows it OR the override record's flag is true`), never able to revoke what the Position already grants, and covering only the four flags that have a Position counterpart other than `manage_special_permissions`. Each override flag is **nullable**: `NULL` means "no override for this flag, defer to the Position" — a real, distinct state from an explicit `false` (though the two behave identically under the additive OR). Managed via `GET`/`PUT /api/v1/employees/{id}/special-permissions`, itself gated by `manage_special_permissions` like any other Position flag.
- A tenant user's role claim (when the old design had one) used to identify who someone was; now that role doesn't exist for tenant users at all, `company_id` + `email` do that job alone (see `get_current_employee_context`). A brand-new company's positions start with zero permissions, and someone must explicitly grant `manage_*` on a Position (or an individual `EmployeePermissionOverride`) before anyone can manage anything.
- `super_admin` is a **separate, platform-level role**, used only by platform operators managing the Companies (tenants) resource itself — the ONE part of the system still gated by role, deliberately untouched by the Position-permission model above (it has no Position/Employee record to derive a permission from, by design). Its tokens carry **no `company_id` claim** (a `super_admin` isn't scoped to any one tenant). `POST`/`PUT /api/v1/companies` require `require_role(["super_admin"])` — a regular per-company user must never be able to create or rename tenants, no matter what their Position permits. Any tenant-scoped endpoint (Employees/Products/Positions) correctly rejects a `super_admin` token with a clean `403 SUPER_ADMIN_NO_TENANT_ACCESS`, not a crash — `super_admin` has no tenant to browse
- Every endpoint must clearly declare what gates it: `require_role([...])` for the platform-level Companies resource, `require_position_permission("manage_x")` for everything else that needs gating
- **"Act as company" mode**: a `super_admin` may send an `X-Acting-Company-Id` header to browse/manage one tenant's Employees/Products/Positions and `GET /api/v1/me/summary` as if they were that company's admin — this is how a platform operator gets into a specific tenant's data without that tenant issuing them a real Employee record. The header is honored **if and only if** the token's own role claim is exactly `super_admin`; for every other caller it must be silently ignored, with `company_id` continuing to come from the JWT's own `company_id` claim exactly as before — never a path for privilege escalation. This single role check lives in one place, `get_acting_company_id` in `app/core/dependencies.py`. `require_position_permission` checks `get_acting_company_id` directly and grants every permission unconditionally while acting — `get_current_employee_context` always reports all-False for `super_admin` (it's never a real employee of the acted-on company, by design, and that exemption is unchanged), so without this special case "act as company" mode would have lost all its manage capability under the position-only model. `GET /api/v1/me/permissions` mirrors the same bypass, so the frontend's controls match what the backend will actually allow.
- Never hardcode Auth0 secrets/API keys in the codebase. Use environment variables only (stored in `.env`, never committed to git)

# Sensitive Data Handling

- Salary and personal employee data are sensitive (PII)
- Never log salary, national ID numbers, or other personal data to console/log files
- Sensitive fields (salary, national ID) should be masked or access-restricted based on role
- Use HTTPS only in production

# Code Style

**Backend (Python/FastAPI)**
- Use type hints in every function
- Keep business logic out of route handlers — put it in `/services`
- Split Pydantic schemas into `XxxCreate`, `XxxUpdate`, `XxxResponse` based on usage
- Use `async def` for any endpoint that queries the database

**Frontend (React/TypeScript)**
- Always use TypeScript. Avoid `any`
- Components use PascalCase, functions/variables use camelCase
- Use functional components + hooks only (no class components)
- Keep API call logic out of components — put it in `/api`

# Testing

- Backend: write tests with `pytest` covering business logic and tenant isolation
- Frontend: write tests with Vitest / React Testing Library for key components
- Run lint and tests for both backend and frontend before every commit
- CI (`.github/workflows/ci.yml`) runs automatically on every push and pull request, on any
  branch: the full backend `pytest` suite (tenant isolation, RBAC, business rules) against a
  temporary Postgres service container that's destroyed at the end of the job — never the
  real Supabase database — plus the frontend Vitest suite and `npm run build`. Both jobs run
  in parallel. This is meant to be a required check before merging to `main`; that has to be
  turned on in the repo's GitHub branch protection settings (Settings → Branches) — a
  workflow file alone doesn't block merges on its own

# Documentation Maintenance

- Whenever a new page/screen is added to the frontend, update the relevant section in `ARCHITECTURE.md`
- Whenever a new database table or column is added, update the schema section in `ARCHITECTURE.md`
- Whenever a new module or major feature is added, briefly note it in `ARCHITECTURE.md`'s overview
- Keep `ARCHITECTURE.md` in sync as part of the same task — don't treat it as a separate follow-up step

# API Response Format

- All API responses use a consistent envelope:
  ```json
  { "success": true, "data": { ... }, "error": null }
  { "success": false, "data": null, "error": { "code": "STRING_CODE", "message": "human readable" } }
  ```
- List endpoints return pagination metadata: `{ "items": [...], "total": 0, "page": 1, "page_size": 20 }`
- HTTP status codes must match the actual result (400 for validation errors, 403 for authorization failures, 404 for not found, 409 for conflicts) — don't return 200 with an error payload

# Error Handling & Logging

- Use a centralized exception handler in FastAPI (`@app.exception_handler`) rather than try/except in every route
- Never expose raw stack traces or database error messages to the client — log the detail server-side, return a generic message to the client
- Log with structured logging (include `company_id`, `user_id`, `request_id` as context) to make multi-tenant issues traceable — but never log PII (see Sensitive Data Handling)

# Database Migrations Workflow

- Every schema change (new table, new column, changed constraint) goes through an Alembic migration — never edit the database manually
- Migration messages must be descriptive, e.g. `add_salary_history_table`, not `update`
- Review autogenerated migrations before applying — Alembic can miss things like renamed columns or index changes
- Add new columns as nullable or with a default first if the table already has data, to avoid breaking existing rows

# Dependency Management

- Don't add a new npm/pip package without a clear reason — check if an existing dependency already covers the need
- Keep `requirements.txt` / `package.json` up to date whenever a dependency is added or removed
- Pin major versions to avoid unexpected breaking changes

# Git & Commit Conventions

- Use conventional commit style: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- One logical change per commit — don't mix a new feature with unrelated refactoring
- Reference the affected module in the commit message when relevant, e.g. `feat(employees): add salary history endpoint`

# Notes / Constraints

- Never modify the production schema directly — always go through migrations (Alembic)
- Required environment variables:
  - Backend: `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`
  - Frontend: `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`
  - Note: no client secret is needed — the frontend is a public SPA client using Authorization Code Flow with PKCE
- See ARCHITECTURE.md for hosting recommendations and free-tier considerations