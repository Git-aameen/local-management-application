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
- Write dedicated tests for tenant isolation, e.g. "a user from Company A must not be able to fetch Company B's data"

# Authentication & Authorization

- Use **OAuth2 via Auth0** — the backend validates JWT tokens issued by Auth0 (do not implement the OAuth flow yourself)
- Minimum role-based access control (RBAC): `admin`, `hr_manager`, `inventory_manager`, `employee` — these four are **tenant-scoped**: every token carrying one of them also carries a `company_id` claim, and every endpoint gated by them must filter by that `company_id`
- `super_admin` is a **separate, platform-level role**, used only by platform operators managing the Companies (tenants) resource itself. It is not one of the four tenant roles above, is never combined with them, and its tokens carry **no `company_id` claim** (a `super_admin` isn't scoped to any one tenant). `POST`/`PUT /api/v1/companies` require `require_role(["super_admin"])` — a regular per-company `admin` must never be able to create or rename tenants; that was a real gap fixed once `super_admin` was introduced (those endpoints previously accepted plain `admin`). Any tenant-scoped endpoint (Employees/Products/Positions) correctly rejects a `super_admin` token with a clean `403 SUPER_ADMIN_NO_TENANT_ACCESS`, not a crash — `super_admin` has no tenant to browse
- Every endpoint must clearly declare the roles allowed to access it, via a dependency (e.g. `require_role(["admin", "hr_manager"])`)
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