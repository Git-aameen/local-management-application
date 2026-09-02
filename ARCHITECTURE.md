# Architecture — Local Management Application (Multi-Tenant Backoffice System)

## 1. High-level Overview

```
┌─────────────────────┐        ┌─────────────────────┐
│   Browser (Client)  │        │        Auth0         │
│  React + TypeScript │◄──────►│  OAuth2 Identity      │
│        SPA           │  login │      Provider         │
└──────────┬───────────┘        └───────────▲──────────┘
           │ API calls + JWT                │ verify token
           ▼                                │
┌─────────────────────────────────────────────────────┐
│                   FastAPI Backend                     │
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
      components/      # PositionListPage.tsx (simple list, not paginated — companies have few positions), PositionFormDialog.tsx (create/edit, name only)
      api.ts            # calls to the positions backend endpoints
      hooks.ts          # React Query: usePositions, useCreatePosition, useUpdatePosition, useDeletePosition
      types.ts
    /products
      components/      # ProductListPage.tsx (table + category filter + low-stock badges + pagination), ProductFormDialog.tsx (create/edit)
      api.ts            # calls to the products backend endpoints
      hooks.ts          # React Query: useProducts, useProductCategories, useCreateProduct, useUpdateProduct, useDeleteProduct
      types.ts
    /auth
      AuthProvider.tsx  # wraps the Auth0 SDK (Auth0Provider)
      hooks.ts          # usePermissions() — UI-only mirror of the backend's require_role() checks (see below)
      components/
        LoginPage.tsx        # "Log In" button -> loginWithRedirect
        LogoutButton.tsx     # -> logout({ logoutParams: { returnTo: origin } })
        ProtectedRoute.tsx   # gates a route on useAuth0().isAuthenticated, else -> /login
  /components/ui       # shadcn/ui primitives: Button, Input, Label, Select, Dialog, AlertDialog + ConfirmDeleteDialog (shared destructive-confirm used by all three delete flows), ErrorDialog (global showErrorDialog(message) — centered, must-acknowledge, used by every mutation's onError; toast stays for onSuccess), Table, Badge, Sonner (toasts), Pagination
  /components/layout   # Sidebar (collapsible nav), Topbar (user email + logout), AppLayout (wraps both + <Outlet/>)
  /lib                 # axios/fetch client (apiClient + useApiClient, attaches Auth0 bearer token), query client, queryKeys.ts (shared React Query keys — companies/employees/positions/products — so e.g. positions + employees can invalidate/share one cached position list), errors.ts (getApiErrorMessage), utils.ts (cn), formatters.ts (formatCurrency — Intl.NumberFormat USD)
  /hooks               # shared hooks (useDebounce, usePagination)
  /context             # CompanyContext (currently selected company)
```

**shadcn/ui setup:** hand-authored (not CLI-generated, to keep the non-interactive build predictable) — `components.json` at the repo root, `@/*` path alias (`vite.config.ts` + `tsconfig.app.json`), CSS variables + `@theme inline` in `index.css` (light/dark via `prefers-color-scheme`, "neutral"/"new-york" palette), `cn()` in `lib/utils.ts`. Underlying deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-*` (slot/label/select/dialog), `sonner` (toasts).

**Routes implemented so far:** `/` (HomePage), `/login` (LoginPage), and — behind `ProtectedRoute` + `AppLayout` (Sidebar/Topbar shell) — `/dashboard` (auth proof-of-flow placeholder), `/companies` (super_admin only — see "Role-based UI"; simple list, not paginated; create/edit dialog is a single `name` field; no delete action — deleting a company would cascade-affect all its employees/products/positions, deliberately not exposed in the UI yet), `/employees` (full CRUD: table, pagination, create/edit dialog with React Hook Form + Zod, position dropdown, toast on success / centered `ErrorDialog` on failure; the Salary column and form field are shown — and, since `usePermissions().canViewSalary` is admin/hr_manager only, editable — solely for those two roles, formatted via `formatCurrency()`; see "Role-based UI" and CLAUDE.md § Sensitive Data Handling), `/positions` (simple list, not paginated; create/edit dialog is a single `name` field; deleting a position that's still assigned to any employees is rejected by the backend with 409 `POSITION_IN_USE`, surfaced here via `ErrorDialog` — no separate pre-check query needed), `/products` (full CRUD: table, category filter dropdown, pagination, create/edit dialog with React Hook Form + Zod — quantity is validated client-side as well as server-side, price is a Decimal field that serializes as a JSON *string* on the wire so the frontend parses it with `Number()` for display/math — items under 10 in stock show a "Low stock" Badge).

**Role-based UI (`usePermissions()`, `features/auth/hooks.ts`):** the Employees/Positions/Products/Companies list pages hide (not disable) their "New X" button and each row's Edit/Delete actions — including the whole Actions table column — based on the same role→permission mapping the backend enforces via `require_role(...)`: `admin`/`hr_manager` → Employees and Positions; `admin`/`inventory_manager` → Products; `super_admin` → Companies. The role is read from `useAuth0().user`'s `https://localmanagementapp.com/role` custom claim (the ID token — this assumes the Auth0 Action sets the claim on both the ID and access tokens, the standard pattern; if it's ever access-token-only, this hook fails closed rather than silently granting access). Any role outside the five known values — including a missing claim — fails closed to read-only, never falls back to full access. **This is UI convenience only**: the backend's `require_role()` dependencies remain the sole enforcement point and reject unauthorized requests regardless of what the UI shows; hiding a button here does not grant or revoke any actual access.

**`super_admin` (platform operator, not a tenant role):** a fifth role, entirely separate from the four tenant-scoped ones — its tokens carry no `company_id` claim by design (it isn't scoped to any one tenant). `usePermissions().canManageCompanies` is true only for `super_admin`; the Sidebar's "Companies" link is shown only when that's true (hidden even for a regular tenant `admin`). The other four nav links (Dashboard/Employees/Positions/Products) stay visible for every role, including `super_admin` — visiting them as `super_admin` correctly shows a clean error state (backend `403 SUPER_ADMIN_NO_TENANT_ACCESS` from `get_current_company_id`, surfaced the same way as any other failed query) rather than crashing, since those pages already render an error state for any failed query.

`usePermissions()` also exposes `canViewSalary` (admin/hr_manager — same role set as `canManageEmployees` today, but kept as a distinct permission since "can see salary" and "can edit employee records" are different concerns that could diverge later). This gates the Employees page's Salary column and the salary field in `EmployeeFormDialog` entirely client-side: the backend's `EmployeeResponse` always includes `salary` for any authenticated request regardless of role — there is no server-side field masking — so a technically savvy `employee`-role user could still retrieve it via a direct API call (e.g. `/docs`). This is the same "UI convenience, not a real boundary" caveat as above; closing that gap for real would mean role-aware field omission in the backend response, which hasn't been built.

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

## 5. Authentication Flow (Auth0 / OAuth2)

1. The user clicks "Log in" → the React SPA redirects to Auth0's Universal Login
2. After a successful login, Auth0 redirects back with an authorization code
3. The frontend exchanges the code for an **access token (JWT)** via the Auth0 SDK
4. Every API call from the frontend attaches the JWT in the `Authorization: Bearer <token>` header
5. The backend extracts `company_id` and `role` from the JWT claims (custom claims configured via Auth0 rules/actions)

**Implementation detail (backend):** JWTs are verified with `PyJWT` against Auth0's public JWKS (`https://{AUTH0_DOMAIN}/.well-known/jwks.json`, fetched and cached in-process), checking signature, expiry, `audience` (`AUTH0_AUDIENCE`), and `issuer` (`https://{AUTH0_DOMAIN}/`). The custom claims are namespaced URIs: `https://localmanagementapp.com/company_id` and `https://localmanagementapp.com/role`. `app/core/security.py` holds the low-level verification; `app/core/dependencies.py` exposes it as FastAPI dependencies (`get_current_company_id`, `get_current_role`, `require_role(...)`) used by every router.

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