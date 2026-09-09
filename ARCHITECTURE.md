# Architecture — Local Management Application (Multi-Tenant Backoffice System)
## 1. High-level Overview

```
┌─────────────────────┐        redirect / callback        ┌─────────────────────┐
│   Browser (Client)  │◄──────────────────────────────────►│        Auth0         │
│  React + TypeScript │                                     │  OAuth2 Identity      │
│        SPA           │                                     │      Provider         │
└──────────┬───────────┘                                     └───────────▲──────────┘
           │ API calls, JWT attached                                     │
           ▼                                                              │ verify token (JWKS)
┌─────────────────────────────────────────────────────┐                  │
│                   FastAPI Backend                     │──────────────────┘
│  ┌───────────┐  ┌───────────┐  ┌───────────────────┐ │
│  │  API layer │→│  Services  │→│  Data access layer  │ │
│  │ (routers)  │  │ (business) │  │   (SQLAlchemy)     │ │
│  └───────────┘  └───────────┘  └──────────┬──────────┘ │
└──────────────────────────────────────────┼──────────────┘
                                            ▼
                                 ┌─────────────────────┐
                                 │     PostgreSQL        │
                                 │  rows filtered by      │
                                 │     company_id         │
                                 └─────────────────────┘
```

The system is split into 3 main layers:
1. **Client layer** — the React SPA the user interacts with
2. **API / application layer** — the FastAPI backend handling auth, business logic, and data access
3. **Data layer** — PostgreSQL storing all companies' data in shared tables, isolated by `company_id`

---

## 2. Frontend Architecture (React + TypeScript)

```
/src
  /app                # app shell: routing, layout, providers
  /features           # organized by domain (feature-based, not type-based)
    /companies
      components/      # CompanyListPage.tsx (simple list, not paginated; no delete — see below), CompanyFormDialog.tsx (create/edit, name only)
      api.ts            # calls to the companies backend endpoints (no delete function — deliberately not built)
      hooks.ts          # React Query: useCompanies, useCreateCompany, useUpdateCompany
      types.ts
    /employees
      components/      # EmployeeListPage.tsx (table + pagination), EmployeeFormDialog.tsx (create/edit)
      api.ts            # calls to the employees + positions backend endpoints (a read-only usePositions() lives here too, for the form's dropdown — see /positions and lib/queryKeys.ts below)
      hooks.ts          # React Query: useEmployees, usePositions, useCreateEmployee, useUpdateEmployee, useDeleteEmployee
      types.ts
    /positions
      components/      # PositionListPage.tsx (simple list, not paginated — companies have few positions), PositionFormDialog.tsx (create/edit: name + a Grade dropdown populated from GET /api/v1/grades, plus the four can_manage_*/can_view_salary checkboxes, pre-filled from the selected grade's stored defaults on NEW positions only — see /grades below)
      api.ts            # calls to the positions backend endpoints
      hooks.ts          # React Query: usePositions, useCreatePosition, useUpdatePosition, useDeletePosition
      types.ts
    /grades
      components/      # GradeListPage.tsx (simple list, not paginated), GradeFormDialog.tsx (create/edit: code, name, level, can_manage_employees/products/positions, can_view_salary)
      api.ts            # calls to the grades backend endpoints
      hooks.ts          # React Query: useGrades, useCreateGrade, useUpdateGrade, useDeleteGrade — shares GRADES_QUERY_KEY with PositionFormDialog's grade dropdown
      types.ts
    /products
      components/      # ProductListPage.tsx (table + category filter + low-stock badges + pagination), ProductFormDialog.tsx (create/edit)
      api.ts            # calls to the products backend endpoints
      hooks.ts          # React Query: useProducts, useProductCategories, useCreateProduct, useUpdateProduct, useDeleteProduct
      types.ts
    /auth
      AuthProvider.tsx  # wraps the app in Auth0Provider (Authorization Code + PKCE)
      hooks.ts          # usePermissions() — UI-only mirror of the backend's require_role() checks (see below)
      api.ts            # calls to /api/v1/me/permissions
      components/
        LoginPage.tsx        # two-column layout (branding left, single "Log In" button right) -> loginWithPopup(), with a loginWithRedirect() fallback if the popup can't open; lives at /login
        LogoutButton.tsx     # Auth0 hosted logout() redirect
        ProtectedRoute.tsx   # gates a route on useAuth0().isAuthenticated, else -> /login
  /components/ui       # shadcn/ui primitives: Button, Input, Label, Select, Dialog, AlertDialog + ConfirmDeleteDialog (shared destructive-confirm used by all three delete flows), ErrorDialog (global showErrorDialog(message) — centered, must-acknowledge, used by every mutation's onError; toast stays for onSuccess), Table, Badge, Sonner (toasts), Pagination
  /components/layout   # Sidebar (collapsible nav), Topbar (user email + logout), AppLayout (wraps both + <Outlet/>)
  /lib                 # axios/fetch client (apiClient + useApiClient, attaches Auth0 bearer token), query client, queryKeys.ts (shared React Query keys — companies/employees/positions/products — so e.g. positions + employees can invalidate/share one cached position list), errors.ts (getApiErrorMessage), utils.ts (cn), formatters.ts (formatCurrency — Intl.NumberFormat USD)
  /hooks               # shared hooks (useDebounce, usePagination)
  /context             # CompanyContext (currently selected company)
```

**shadcn/ui setup:** hand-authored (not CLI-generated, to keep the non-interactive build predictable) — `components.json` at the repo root, `@/*` path alias (`vite.config.ts` + `tsconfig.app.json`), CSS variables + `@theme inline` in `index.css` (light/dark via `prefers-color-scheme`, "neutral"/"new-york" palette), `cn()` in `lib/utils.ts`. Underlying deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-*` (slot/label/select/dialog), `sonner` (toasts).

**Routes implemented so far:** `/` (redirects straight to `/login`, no landing page content of its own), `/login` (LoginPage — two-column layout, a single "Log In" button that calls `loginWithPopup()` (falling back to `loginWithRedirect()` if the popup can't open — see § 5); an already-authenticated visitor is redirected onward from here via `useAuth0().isAuthenticated`), and — behind `ProtectedRoute` + `AppLayout` (Sidebar/Topbar shell) — `/dashboard` (auth proof-of-flow placeholder), `/companies` (super_admin only — see "Role-based UI"; simple list, not paginated; create/edit dialog is a single `name` field; no delete action — deleting a company would cascade-affect all its employees/products/positions, deliberately not exposed in the UI yet), `/employees` (full CRUD: table, pagination, create/edit dialog with React Hook Form + Zod, position dropdown, toast on success / centered `ErrorDialog` on failure; the Salary column and form field are shown — and, since `usePermissions().canViewSalary` is admin/hr_manager only, editable — solely for those two roles, formatted via `formatCurrency()`; see "Role-based UI" and CLAUDE.md § Sensitive Data Handling), `/positions` (simple list, not paginated; create/edit dialog has `name`, a Grade dropdown, and the four permission checkboxes — deleting a position that's still assigned to any employees is rejected by the backend with 409 `POSITION_IN_USE`, surfaced here via `ErrorDialog` — no separate pre-check query needed), `/grades` (simple list, not paginated; create/edit dialog has `code`/`name`/`level` plus the same four checkboxes as Positions, stored as that grade's *default* values — see "Grades" below; deleting a grade still assigned to any position is rejected with 409 `GRADE_IN_USE`), `/products` (full CRUD: table, category filter dropdown, pagination, create/edit dialog with React Hook Form + Zod — quantity is validated client-side as well as server-side, price is a Decimal field that serializes as a JSON *string* on the wire so the frontend parses it with `Number()` for display/math — items under 10 in stock show a "Low stock" Badge).

**Role-based UI (`usePermissions()`, `features/auth/hooks.ts`):** the Employees/Positions/Products/Companies list pages hide (not disable) their "New X" button and each row's Edit/Delete actions — including the whole Actions table column — based on the same role→permission mapping the backend enforces via `require_role(...)`: `admin`/`hr_manager` → Employees and Positions; `admin`/`inventory_manager` → Products; `super_admin` → Companies. The role is read from the Auth0 ID token's own `https://localmanagementapp.com/role` custom claim (`useAuth0().user`), client-side. Any role outside the five known values — including a missing claim — fails closed to read-only, never falls back to full access. **This is UI convenience only**: the backend's `require_role()` dependencies remain the sole enforcement point and reject unauthorized requests regardless of what the UI shows; hiding a button here does not grant or revoke any actual access.

**`super_admin` (platform operator, not a tenant role):** a fifth role, entirely separate from the four tenant-scoped ones — its tokens carry no `company_id` claim by design (it isn't scoped to any one tenant). `usePermissions().canManageCompanies` is true only for `super_admin`; the Sidebar's "Companies" link is shown only when that's true (hidden even for a regular tenant `admin`). The other four nav links (Dashboard/Employees/Positions/Products) stay visible for every role, including `super_admin` — visiting them as `super_admin` correctly shows a clean error state (backend `403 SUPER_ADMIN_NO_TENANT_ACCESS` from `get_current_company_id`, surfaced the same way as any other failed query) rather than crashing, since those pages already render an error state for any failed query.

Salary visibility (`can_view_salary`) is the one permission the client-only `usePermissions()` cannot compute by itself, since it depends on OR-ing the JWT role against the caller's own Position/Grade data — something only the backend knows. It's fetched separately via `useMyPermissions()` (`features/auth/hooks.ts`, `GET /api/v1/me/permissions`) and gates the Employees page's Salary column and the salary field in `EmployeeFormDialog`: `(role is admin/hr_manager) OR (the caller's own position's can_view_salary is true)`. This is still UI-only: the backend's `EmployeeResponse` always includes `salary` for any authenticated request regardless of role — there is no server-side field masking — so a technically savvy `employee`-role user could still retrieve it via a direct API call (e.g. `/docs`). Closing that gap for real would mean role-aware field omission in the backend response, which hasn't been built.

**Grades** (`app/models/grade.py`, `app/api/v1/grades.py`): a per-company, customizable set of pay/permission tiers (e.g. `S`/`M`/`HR`/`C`/`A`) that replaced an earlier hardcoded frontend `grade_code` → permission-defaults mapping. A Grade's four boolean flags (`can_manage_employees/products/positions`, `can_view_salary`) are only ever copied as *default* values onto a Position the moment it's created (see `PositionFormDialog.tsx`'s grade dropdown and `position_service.create_position`) — a Position stores its own independent copy of all four, editable after creation; editing a Grade later never retroactively changes an existing Position. Every company gets 5 standard grades seeded automatically on creation (`company_service.create_company` → `grade_service.seed_default_grades`); pre-existing companies were backfilled once by the `add_grades_table_and_position_grade_id` migration. Grades and Positions share the same `can_manage_positions` write-gate (`require_role_or_position_permission`) and the same delete-in-use protection pattern (`GRADE_IN_USE` / `POSITION_IN_USE`).

**State management approach:**
- Use **TanStack Query (React Query)** to manage server state (fetch, cache, invalidate) — avoid Redux unless state truly requires it
- Use React Context only for small global UI state, e.g. theme, current company, sidebar collapsed state

Feature-based folder structure is preferred over type-based grouping (separate top-level `/components`, `/hooks`, `/api`) because related files for a given feature stay close together, reducing the need to jump across folders when modifying one feature.

---

## 3. Backend Architecture (FastAPI)

```
/app
  /api
    /v1
      employees.py     # router: /api/v1/employees
      products.py      # router: /api/v1/products
      auth.py           # router: /api/v1/auth (if needed, e.g. callback)
  /core
    config.py           # env variables, settings
    security.py          # JWT validation, get_current_user, get_current_company
    dependencies.py      # shared FastAPI dependencies
  /models                # SQLAlchemy ORM models
    employee.py
    product.py
    company.py
  /schemas                # Pydantic request/response schemas
    employee.py
    product.py
  /services                # business logic separated from route handlers
    employee_service.py
    product_service.py
  /db
    session.py             # database session
    base.py
main.py
/tests
  conftest.py            # db_session (rollback-per-test isolation), client (ASGI + get_db override), make_token/auth_headers (real signed JWTs, JWKS mocked), company_a/b + position_a/b + employee_a/b + product_a/b fixtures
  test_tenant_isolation.py
  test_rbac.py
  test_business_rules.py
pytest.ini
```

**Key principles:**
- **Layered architecture**: Router → Service → Repository/ORM. Business logic never lives directly in the route handler, which keeps testing and maintenance easier
- **FastAPI dependency injection** extracts `current_user` and `current_company` from the JWT and passes them into the service layer automatically for every endpoint — preventing accidental omission of the `company_id` filter
- **Async-first**: endpoints and database calls are `async def` to handle concurrent requests efficiently
- **Testing** (`pytest`, `backend/tests/`): no separate test database is provisioned — tests run against the real configured `DATABASE_URL`, but every test's DB work happens inside one outer transaction that's rolled back at teardown (`join_transaction_mode="create_savepoint"`, so even the application code's own internal `commit()` calls only complete a savepoint), so nothing is ever actually persisted. A dedicated `NullPool` engine is used for tests specifically, separate from the app's pooled `engine` — pytest-asyncio gives each test its own event loop, and asyncpg connections can't be reused across event loops, so pooling (which the app's engine does) breaks on the second test; `NullPool` opens a fresh connection every time instead. Auth is exercised close to for-real: `make_token()`/`auth_headers()` mint genuinely RS256-signed JWTs with a test keypair, and only the network round-trip to fetch Auth0's JWKS is mocked (a session-scoped fixture swaps in the test public key) — signature/audience/issuer/expiry verification and all of `get_current_company_id`/`get_current_role`/`require_role` run unmodified.
- **CORS**: `CORSMiddleware` in `main.py` allows the local frontend origin (`http://localhost:5173`) with all methods/headers, so the browser can send the `Authorization` bearer header. Origins are hardcoded for local dev — move to a setting once a production frontend URL exists

---

## 4. Data Layer (PostgreSQL)

**Multi-tenant strategy: shared table + `company_id`**

```sql
companies
  id (PK)
  name
  created_at

positions
  id (PK)
  company_id (FK → companies.id)  -- every query must filter on this column
  name                             -- e.g. "Senior Accountant"; HR job title only, unrelated to RBAC
  grade_id (FK → grades.id, nullable)  -- only ever consulted for DEFAULT values at creation time (see Grades below)
  can_manage_employees (bool, default false)  -- additive to Auth0 role RBAC — see require_role_or_position_permission
  can_manage_products (bool, default false)
  can_manage_positions (bool, default false)
  can_view_salary (bool, default false)
  grade_code (string, nullable)    -- DEPRECATED: superseded by grade_id; kept in the DB, unmapped/unexposed by the API, pending a follow-up migration to drop it
  created_at

grades
  id (PK)
  company_id (FK → companies.id)  -- every query must filter on this column
  code                             -- e.g. "S"/"M"/"HR"/"C"/"A"; unique per (company_id, code)
  name                             -- e.g. "Manager"
  level (int)                      -- display/ordering only
  can_manage_employees (bool, default false)  -- copied onto a Position as its DEFAULT the moment it's created — never re-evaluated live
  can_manage_products (bool, default false)
  can_manage_positions (bool, default false)
  can_view_salary (bool, default false)
  created_at

employees
  id (PK)
  company_id (FK → companies.id)  -- every query must filter on this column
  position_id (FK → positions.id)
  full_name
  salary
  hired_at
  email
  created_at
  updated_at

products
  id (PK)
  company_id (FK → companies.id)
  name
  category
  quantity
  price
  created_at
  updated_at
```

- Index `company_id` on every table (except `companies` itself) for query performance
- Index `position_id` on `employees` for query performance
- System access control (`admin` / `hr_manager` / `inventory_manager` / `employee`) is handled entirely via Auth0 custom claims — it is not stored in the database. `positions` is HR job-title data only
- Consider **PostgreSQL Row-Level Security (RLS)** as a second layer of defense on top of service-layer filtering — if the service layer ever forgets to filter, RLS prevents cross-tenant data leakage

---

## 5. Authentication Flow (Auth0 Authorization Code + PKCE, via popup)

1. The user visits `/`, which redirects straight to `/login` (`<Navigate to="/login" replace />` in `App.tsx`) — a two-column page (branding on the left, a single "Log In" button on the right)
2. Clicking "Log In" calls `loginWithPopup()` (`@auth0/auth0-react`'s `useAuth0()`), which opens Auth0's hosted Universal Login in a popup window rather than navigating the whole page away — the frontend never sees or handles a password itself, and the main app window never unmounts
3. Auth0 authenticates the user in the popup (including its own hosted "Forgot password" link, adaptive MFA, and breached-password/brute-force protection); the Auth0 SDK in the opener window polls the popup's URL for the callback (`code`/`state`) and completes the token exchange client-side (PKCE — no client secret involved, since this is a public SPA client), then closes the popup
4. If the popup can't complete — blocked by the browser or an extension, closed early by the user, timed out — `LoginPage.tsx` catches the failure and shows an inline message with a "Continue without a popup" button that falls back to `loginWithRedirect()`, a full-page redirect through the same Auth0 flow that every browser allows unconditionally
5. `ProtectedRoute.tsx` gates every non-`/login` route on `useAuth0().isAuthenticated`; `LoginPage.tsx` itself redirects an already-authenticated visitor onward via `getPostLoginRedirectPath(role)` — straight to `/dashboard`, or `/select-company` for `super_admin` — no intermediate landing/click-through page, regardless of which of the two flows completed the login
6. The frontend attaches the access token as `Authorization: Bearer <token>` on every API call (`lib/apiClient.ts`, via `getAccessTokenSilently()`) and reads role/email for UI display from the ID token (`useAuth0().user`)
7. The backend verifies the access token on every request exactly the same way regardless of how it was obtained (see "Implementation detail" below)
8. Logout (`LogoutButton.tsx`) calls Auth0's hosted `logout()`, which clears the Auth0 session and redirects back to the app

**`redirect_uri` note:** `AuthProvider.tsx` sets `redirect_uri` to `${origin}/login`, not the bare origin — Auth0 must land back on a route that renders `LoginPage` directly. Landing on `/` would hit `App.tsx`'s unconditional `<Navigate to="/login" replace />` first, which strips the `code`/`state` query params before the SDK can read them and leaves the user stuck looking logged out. This applies to both the popup and redirect-fallback flows, since both share the same configured `redirect_uri`. The popup flow additionally needs the Auth0 application's **Allowed Web Origins** to include the frontend's origin (the redirect flow doesn't, since it never makes a CORS call to Auth0 directly).

**Implementation detail (backend):** JWTs are verified with `PyJWT` against Auth0's public JWKS (`https://{AUTH0_DOMAIN}/.well-known/jwks.json`, fetched and cached in-process), checking signature, expiry, `audience` (`AUTH0_AUDIENCE`), and `issuer` (`https://{AUTH0_DOMAIN}/`). The custom claims are namespaced URIs: `https://localmanagementapp.com/company_id`, `https://localmanagementapp.com/role`, and `https://localmanagementapp.com/email`. `app/core/security.py` holds the low-level verification; `app/core/dependencies.py` exposes it as FastAPI dependencies (`get_current_company_id`, `get_current_role`, `require_role(...)`) used by every router.

> Backend-side validation rules (JWT verification, RBAC, secrets handling) are defined in `CLAUDE.md`.

---

## 6. Guidelines for a Modern, Polished UI

### Choosing a UI library / design system
| Option | Strengths |
|---|---|
| **shadcn/ui** (recommended) | Not a black-box library — you copy component code into your project and own it fully. Pairs naturally with Tailwind and produces a modern look |
| Radix UI + Tailwind | Fully accessible primitives, but you design the styling yourself |
| Mantine | Fast to get a complete look, but harder to customize deeply than shadcn |

### Principles for a "modern" feel
- **Generous whitespace** — avoid cramming information, especially on table/dashboard pages
- **Clear typography scale** — stick to two font weights (regular/medium); avoid heavy bold throughout a page
- **Flat design, no heavy gradients/shadows** — use thin borders (1px) to separate sections instead of drop shadows
- **Dark mode support from the start** — use CSS variables for all colors (`--surface`, `--text-primary`, etc.) to make light/dark switching trivial
- **Small micro-interactions** — hover states, 150–200ms transitions on buttons/cards make the UI feel responsive
- **Consistent spacing scale** — use Tailwind's spacing scale (4px multiples) throughout; avoid arbitrary margin/padding values
- **One icon set across the app** — e.g. Lucide or Tabler icons; don't mix icon sets

### Components this project's design system should include
- Data table (sort, filter, pagination) — for employees/products list pages
- Form components (input, select, date picker) with validation states
- Modal / Drawer for create/edit flows
- Badge/Tag — for status display, e.g. "Active", "Low stock"
- Collapsible sidebar navigation
- Toast notifications for action feedback

### Supporting tools
- **Tailwind CSS** — primary styling
- **Framer Motion** — subtle animation (page transitions, modal fade-in)
- **React Hook Form + Zod** — type-safe form handling and validation

---

## 7. Deployment (Suggested Approach)

```
Frontend  → Vercel / Netlify (static hosting, CDN, auto-deploy from git)
Backend   → Railway / Render / Fly.io (FastAPI container)
Database  → Supabase / Neon (managed PostgreSQL, free tier)
Auth      → Auth0 (managed service, free tier covers a reasonable MAU range)
```

This setup lets you get started with no cost and scale each piece independently as the project grows.