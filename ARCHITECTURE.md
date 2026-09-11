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
      components/      # EmployeeListPage.tsx (card grid + pagination; click a card to open EmployeeDetailDialog.tsx, a read-only view with its own Edit/Delete buttons), EmployeeFormDialog.tsx (create/edit; shows the selected Position's own permissions read-only, and — only when the viewer's own Position grants manage_special_permissions — a PermissionOverrideSection.tsx mini-form for that employee's individual overrides)
      api.ts            # calls to the employees + positions backend endpoints (a read-only usePositions() lives here too, for the form's dropdown — see /positions and lib/queryKeys.ts below)
      hooks.ts          # React Query: useEmployees, usePositions, useCreateEmployee, useUpdateEmployee, useDeleteEmployee, useEmployeePermissionOverride, useUpdateEmployeePermissionOverride
      types.ts
    /positions
      components/      # PositionListPage.tsx (card grid, not paginated — companies have few positions; click a card to open PositionDetailDialog.tsx), PositionFormDialog.tsx (create/edit: name + five manage_*/view_salary checkboxes set directly on the Position — no shared "Grade" to pick from anymore)
      api.ts            # calls to the positions backend endpoints
      hooks.ts          # React Query: usePositions, useCreatePosition, useUpdatePosition, useDeletePosition
      types.ts
    /products
      components/      # ProductListPage.tsx (card grid + category filter + low-stock badges + pagination; click a card to open ProductDetailDialog.tsx), ProductFormDialog.tsx (create/edit)
      api.ts            # calls to the products backend endpoints
      hooks.ts          # React Query: useProducts, useProductCategories, useCreateProduct, useUpdateProduct, useDeleteProduct
      types.ts
    /auth
      AuthProvider.tsx  # wraps the app in Auth0Provider (Authorization Code + PKCE)
      hooks.ts          # usePermissions() — identity only (role, canManageCompanies); useMyPermissions() — the caller's own Position-derived permissions from the backend, see "Role-based UI" below
      api.ts            # calls to /api/v1/me/permissions
      components/
        LoginPage.tsx        # two-column layout (branding left, single "Log In" button right) -> loginWithPopup(), with a loginWithRedirect() fallback if the popup can't open; lives at /login
        LogoutButton.tsx     # Auth0 hosted logout() redirect
        ProtectedRoute.tsx   # gates a route on useAuth0().isAuthenticated, else -> /login; optionally also takes a requiredPermission prop (a boolean key of useMyPermissions()'s MyPermissions, e.g. "manage_employees") that renders AccessDeniedPage instead of the route when the check fails
        AccessDeniedPage.tsx # shown by ProtectedRoute's requiredPermission check — "you don't have permission", link back to /dashboard
        AccountNotProvisionedPage.tsx  # shown when the backend rejects a request with 403 ACCOUNT_NOT_PROVISIONED
        RequireActingCompanyForSuperAdmin.tsx  # mandatory full-screen gate: a super_admin with no acting company is bounced to /select-company
  /components/ui       # shadcn/ui primitives: Button (elevated prop for the soft-neumorphism raised/pressed shadow — see § 6), Input, Label, Select, Dialog, AlertDialog + ConfirmDeleteDialog (shared destructive-confirm used by all three delete flows), Popover (hand-authored on @radix-ui/react-popover, same pattern as Dialog — backs Sidebar's SettingsPopover; Radix's own DismissableLayer handles click-outside/Escape, no extra code needed), ErrorDialog (global showErrorDialog(message) — centered, must-acknowledge, used by every mutation's onError; toast stays for onSuccess), Table (still used by CompanyListPage only — Employees/Positions/Products moved to a card grid, see § 6), Badge, NeumorphicCard (shared raised container the Employees/Positions/Products card grids use instead of a bordered table wrapper), DetailRow (flat label/value row for the read-only detail dialogs), Sonner (toasts), Pagination
  /components/layout   # Sidebar (single-column soft-neumorphism nav, collapsible to an icon-only rail — see § 6; SettingsPopover.tsx, the gear row at the bottom, holds the user's email + Sign out instead of a persistent Topbar control), Topbar (acting-as-company "Exit company view" control only — renders nothing otherwise), AppLayout (wraps both + <Outlet/>, owns the Sidebar's collapsed state)
  /lib                 # axios/fetch client (apiClient + useApiClient, attaches Auth0 bearer token), query client, queryKeys.ts (shared React Query keys — companies/employees/positions/products — so e.g. positions + employees can invalidate/share one cached position list), errors.ts (getApiErrorMessage), utils.ts (cn), formatters.ts (formatCurrency — Intl.NumberFormat USD)
  /hooks               # shared hooks (useDebounce, usePagination)
  /context             # CompanyContext (currently selected company)
```

**shadcn/ui setup:** hand-authored (not CLI-generated, to keep the non-interactive build predictable) — `components.json` at the repo root, `@/*` path alias (`vite.config.ts` + `tsconfig.app.json`), CSS variables + `@theme inline` in `index.css` (light mode only, "neutral"/"new-york" palette, plus `--shadow-light`/`--shadow-dark` for the soft-neumorphism shadow pair — see § 6), `cn()` in `lib/utils.ts`, `Inter Variable` (`@fontsource-variable/inter`) as the app-wide font. Underlying deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-*` (slot/label/select/dialog), `sonner` (toasts).

**Routes implemented so far:** `/` (redirects straight to `/login`, no landing page content of its own), `/login` (LoginPage — two-column layout, a single "Log In" button that calls `loginWithPopup()` (falling back to `loginWithRedirect()` if the popup can't open — see § 5); an already-authenticated visitor is redirected onward from here via `useAuth0().isAuthenticated`), and — behind `ProtectedRoute` + `AppLayout` (Sidebar/Topbar shell) — `/dashboard` (auth proof-of-flow placeholder), `/companies` (super_admin only — see "Role-based UI"; simple list, not paginated; create/edit dialog is a single `name` field; no delete action — deleting a company would cascade-affect all its employees/products/positions, deliberately not exposed in the UI yet), `/employees` (route-gated on `manage_employees` too — `<ProtectedRoute requiredPermission="manage_employees">`, see "Role-based UI"; full CRUD: card grid + pagination (clicking a card opens `EmployeeDetailDialog`, a read-only view with its own Edit/Delete buttons — the card's own inline icon buttons do the same thing without opening it first), create/edit dialog with React Hook Form + Zod, position dropdown, toast on success / centered `ErrorDialog` on failure; salary is shown — and, since `useMyPermissions().view_salary` is granted per-Position now, editable — solely for whoever's own Position grants it, formatted via `formatCurrency()`; see "Role-based UI" and CLAUDE.md § Sensitive Data Handling), `/positions` (route-gated on `manage_positions` too — `requiredPermission="manage_positions"`; card grid, not paginated; click a card for `PositionDetailDialog`; create/edit dialog has `name` plus five `manage_*`/`view_salary` checkboxes set directly on the Position — no shared "Grade" concept anymore (retired — see § 4) — deleting a position that's still assigned to any employees is rejected by the backend with 409 `POSITION_IN_USE`, surfaced here via `ErrorDialog` — no separate pre-check query needed), `/products` (full CRUD: card grid + category filter dropdown + pagination, click a card for `ProductDetailDialog`; create/edit dialog with React Hook Form + Zod — quantity is validated client-side as well as server-side, price is a Decimal field that serializes as a JSON *string* on the wire so the frontend parses it with `Number()` for display/math — items under 10 in stock show a "Low stock" Badge, on both the card and the detail dialog).

**Role-based UI — Position permission is the sole source of truth.** Employees/Positions/Products manage access, and whether Employees/Positions are reachable at all, reads exclusively from `useMyPermissions()` (`features/auth/hooks.ts`, `GET /api/v1/me/permissions`) — a real backend call, not a client-side JWT decode — which mirrors exactly what `require_position_permission` enforces server-side (see § 3 and § 5 below). `usePermissions()` (a plain JWT-role read) only exposes `role` and `canManageCompanies`; there is no client-side role → permission map for these modules, so there's nothing to drift out of sync with the backend.

- **Products** — visible to every role; the list page hides (not disables) its "New Product" button and each card's Edit/Delete actions based on `useMyPermissions().manage_products`.
- **Employees and Positions** — restricted modules. Their Sidebar entries always render (never hidden) but show **disabled** when `useMyPermissions()` reports the corresponding flag as `false` — reduced opacity, `cursor-not-allowed`, `aria-disabled="true"`, a "no access" `title` tooltip, and no `<a href>`/navigation at all (rendered as a plain `<span>`, not `NavLink`, when disabled) — see `components/layout/Sidebar.tsx`. This is deliberately visible-but-inert rather than hidden, so a caller without the grant can at least see the module exists. A disabled Sidebar entry is cosmetic on its own, though: the real boundary is `App.tsx` wrapping `/employees` and `/positions` each in their own `<ProtectedRoute requiredPermission="manage_x">` (`features/auth/components/ProtectedRoute.tsx`), which renders `AccessDeniedPage` instead of the route if the check fails — so typing the URL directly doesn't get around the disabled link either.
- **Companies** — the one module still gated by role, not Position permission (see `super_admin` below); same disabled-not-hidden Sidebar treatment, sourced from `usePermissions().canManageCompanies` instead of `useMyPermissions()`. `/companies` has no `requiredPermission` route guard the way `/employees`/`/positions` do — a non-`super_admin` typing that URL directly currently just gets whatever `CompanyListPage` renders with no manage controls, rather than `AccessDeniedPage`; only its Sidebar entry is disabled today.

Whether a Position grants a flag is set directly on that Position (no more shared "Grade" tier — see § 4) OR the caller's own `EmployeePermissionOverride` record, if one exists and that flag isn't null (`manage_special_permissions` has no override counterpart). Role plays no part in this for any of these modules. **This is still UI convenience only, not itself the enforcement** — `useMyPermissions()`'s whole point is to mirror `require_position_permission` exactly, but the backend dependency is what actually rejects a request; the frontend flags exist purely to avoid showing a control that would 403.

**`super_admin` (platform operator, not a tenant role):** the one part of this system still gated by role — it has no Position/Employee record to derive a permission from, by design, and is also the only role that still exists as an Auth0 claim at all (see § 5 — tenant users no longer carry a role claim). Its tokens carry no `company_id` claim (a `super_admin` isn't scoped to any one tenant). `usePermissions().canManageCompanies` is true only for `super_admin`. Dashboard and Products stay always-enabled for every role, including `super_admin` — visiting Products as `super_admin` correctly shows a clean error state (backend `403 SUPER_ADMIN_NO_TENANT_ACCESS` from `get_current_company_id`) rather than crashing. Employees/Positions, by contrast, are shown disabled and route-blocked for a `super_admin` exactly like anyone else with no grant — *unless* they're acting as a company (`lib/actingCompany.ts`), in which case `useMyPermissions()` reports every flag `true` (mirroring `require_position_permission`'s own acting-mode bypass — see § 5), so "act as company" mode can still reach and manage these modules even though `get_current_employee_context` always reports all-False permissions for a `super_admin` token on its own.

> **Backend note:** as of this write-up, the backend's `GET` endpoints for Employees/Positions/Products have no permission check at all — any provisioned tenant user can list/view them via a direct API call (`tests/test_rbac.py::test_any_tenant_role_can_read_regardless_of_position_permission`); only the `POST`/`PUT`/`DELETE` endpoints require the matching `require_position_permission(...)` grant. The frontend gating above (disabled Sidebar entries + blocked routes) is therefore convenience/UX only for someone with no grant — same caveat as the salary-masking gap below — not an actual read boundary; a technically savvy user could still retrieve this data by calling the API directly. Making reads a real boundary would mean adding a permission dependency to those `GET` routes, which hasn't been done.

Salary visibility (`view_salary`) works exactly the same way as the other `manage_*` flags — `useMyPermissions().view_salary` gates the Employees page's Salary column and the salary field in `EmployeeFormDialog`, sourced from the caller's own Position (or `EmployeePermissionOverride`), never the JWT role. This is still UI-only: the backend's `EmployeeResponse` always includes `salary` for any authenticated request regardless of permission — there is no server-side field masking — so a technically savvy user without the grant could still retrieve it via a direct API call (e.g. `/docs`). Closing that gap for real would mean permission-aware field omission in the backend response, which hasn't been built.

**Per-employee permission override** (`app/models/employee_permission_override.py`, `employee_permission_overrides` table): a purely additive, per-employee exception on top of whatever the employee's own Position already grants — `effective = (Position allows it) OR (this record's flag is true)`, never able to take access away. Each of its four flags (`manage_employees/products/positions`, `view_salary` — no `manage_special_permissions` counterpart) is nullable: `NULL` means "no override, defer to the Position" — a real, distinct state from an explicit `false`, though the two behave identically under the OR. Managed via `GET`/`PUT /api/v1/employees/{id}/special-permissions` (`PermissionOverrideSection.tsx` on the Employee edit view), itself gated by `manage_special_permissions` — just another flag on the caller's own Position, with no role-based fallback and no override for that one flag specifically.

**State management approach:**
- Use **TanStack Query (React Query)** to manage server state (fetch, cache, invalidate) — avoid Redux unless state truly requires it
- Use React Context only for small global UI state, e.g. current company (`CompanyContext`)

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
  manage_employees (bool, default false)  -- set directly on the Position now — see require_position_permission. No more shared "Grade" tier (retired)
  manage_products (bool, default false)
  manage_positions (bool, default false)
  view_salary (bool, default false)
  manage_special_permissions (bool, default false)  -- gates GET/PUT .../special-permissions; replaced the old "Admin-grade position" check
  created_at

employee_permission_overrides
  id (PK)
  employee_id (FK → employees.id, unique)  -- at most one row per employee
  manage_employees (bool, nullable)  -- NULL = no override, defer to the Position. Purely ADDITIVE, layered on top of whatever the employee's own Position already allows — see require_position_permission. No manage_special_permissions column — that flag has no override
  manage_products (bool, nullable)
  manage_positions (bool, nullable)
  view_salary (bool, nullable)
  created_at
  updated_at

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
- Auth0-issued roles are never stored in the database — only in the JWT, and only a `super_admin` token carries one at all now (see CLAUDE.md § Authentication & Authorization). Manage permissions for Employees/Positions/Products come entirely from `positions`/`employee_permission_overrides` above
- Consider **PostgreSQL Row-Level Security (RLS)** as a second layer of defense on top of service-layer filtering — if the service layer ever forgets to filter, RLS prevents cross-tenant data leakage

---

## 5. Authentication Flow (Auth0 Authorization Code + PKCE, via popup)

1. The user visits `/`, which redirects straight to `/login` (`<Navigate to="/login" replace />` in `App.tsx`) — a two-column page (branding on the left, a single "Log In" button on the right)
2. Clicking "Log In" calls `loginWithPopup()` (`@auth0/auth0-react`'s `useAuth0()`), which opens Auth0's hosted Universal Login in a popup window rather than navigating the whole page away — the frontend never sees or handles a password itself, and the main app window never unmounts
3. Auth0 authenticates the user in the popup (including its own hosted "Forgot password" link, adaptive MFA, and breached-password/brute-force protection); the Auth0 SDK in the opener window polls the popup's URL for the callback (`code`/`state`) and completes the token exchange client-side (PKCE — no client secret involved, since this is a public SPA client), then closes the popup
4. If the popup can't complete — blocked by the browser or an extension, closed early by the user, timed out — `LoginPage.tsx` catches the failure and shows an inline message with a "Continue without a popup" button that falls back to `loginWithRedirect()`, a full-page redirect through the same Auth0 flow that every browser allows unconditionally
5. `ProtectedRoute.tsx` gates every non-`/login` route on `useAuth0().isAuthenticated`; `LoginPage.tsx` itself redirects an already-authenticated visitor onward via `getPostLoginRedirectPath(role)` — straight to `/dashboard`, or `/select-company` for `super_admin` — no intermediate landing/click-through page, regardless of which of the two flows completed the login
6. The frontend attaches the access token as `Authorization: Bearer <token>` on every API call (`lib/apiClient.ts`, via `getAccessTokenSilently()`); it reads `role` (for `super_admin` only — see below) from the ID token's custom claim (`useAuth0().user`) and the standard OIDC `email` claim for display in the Topbar, which is separate from the custom, namespaced email claim the backend uses
7. The backend verifies the access token on every request exactly the same way regardless of how it was obtained (see "Implementation detail" below)
8. Logout (`LogoutButton.tsx`) calls Auth0's hosted `logout()`, which clears the Auth0 session and redirects back to the app

**`redirect_uri` note:** `AuthProvider.tsx` sets `redirect_uri` to `${origin}/login`, not the bare origin — Auth0 must land back on a route that renders `LoginPage` directly. Landing on `/` would hit `App.tsx`'s unconditional `<Navigate to="/login" replace />` first, which strips the `code`/`state` query params before the SDK can read them and leaves the user stuck looking logged out. This applies to both the popup and redirect-fallback flows, since both share the same configured `redirect_uri`. The popup flow additionally needs the Auth0 application's **Allowed Web Origins** to include the frontend's origin (the redirect flow doesn't, since it never makes a CORS call to Auth0 directly).

**Custom claims (Auth0 Action, configured in the Auth0 dashboard — not something this codebase can set):** the namespaced custom claims are `https://localmanagementapp.com/company_id`, `https://localmanagementapp.com/email`, and `https://localmanagementapp.com/role`. The post-login Action must branch by user type:
- **Tenant user** (has an `Employee` record in some company): set `company_id` and `email` only — **do not set `role` at all** for this branch. This is a deliberate architecture change (see CLAUDE.md § Authentication & Authorization) — the backend now decides everything about a tenant user's manage permissions from their own Position (`app/models/position.py`) and any `EmployeePermissionOverride`, never from a role claim.
- **Platform operator (`super_admin`)**: set `role = "super_admin"` only — no `company_id` (a `super_admin` isn't scoped to any one tenant). This is the one and only role value that should ever appear in a token.

**Implementation detail (backend):** JWTs are verified with `PyJWT` against Auth0's public JWKS (`https://{AUTH0_DOMAIN}/.well-known/jwks.json`, fetched and cached in-process), checking signature, expiry, `audience` (`AUTH0_AUDIENCE`), and `issuer` (`https://{AUTH0_DOMAIN}/`). `app/core/security.py` holds the low-level verification; `app/core/dependencies.py` exposes it as FastAPI dependencies — `get_current_role()` returns the role claim as-is (`None` for a tenant user, never an error), `get_current_company_id`/`get_current_employee_context` key off `company_id`/`email` directly, and `require_role(["super_admin"])` is the only place a role comparison still happens, used only by every router.

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
- **Clear typography scale** — stick to two font weights (regular/medium); avoid heavy bold throughout a page. App-wide font is `Inter Variable` (`@fontsource-variable/inter`), chosen for its readability at small sizes and tabular figures for numeric columns (price/salary/quantity)
- **Soft neumorphism, scoped deliberately** — the Employees/Products/Positions card grids, their raised buttons/inputs/badges, and detail-dialog action buttons use a two-tone `box-shadow` pair (`--shadow-light`/`--shadow-dark`, see below) for a subtle extruded look, applied via `.neu-raised`/`.neu-raised-sm`/`.neu-pressed-sm`/`.neu-inset-sm` utilities in `index.css` and the `NeumorphicCard` component / `Button`'s `elevated` prop. Deliberately **not** applied to: table/grid cell text (kept at full `--foreground`/`--background` contrast), `focus-visible` rings (always a solid, high-contrast ring — never just a shadow), selected rows, or form error states (`aria-invalid` flattens the shadow and relies on the `--destructive` border/ring color instead) — see "Card & control redesign" below
- **Light mode only, by design** — there is no dark theme, no theme toggle, and no `prefers-color-scheme` media query anywhere in `index.css`; `color-scheme: light` is set explicitly on `:root` so browser-native controls (scrollbars, form widgets) don't try to darken themselves either. Still use CSS variables for every color (`--background`, `--card`, `--foreground`, `--primary`, etc., defined in `index.css`) rather than hardcoding hex in components — not for light/dark switching (there isn't any), but because it's what keeps the whole app's palette editable from one file, as this section's own history has shown twice now.
- **Palette: soft-green neumorphism** — `--background: #EAF0E9` (page), `--card: #F2F6F1` (dialogs/cards/Sidebar). These two are close in value ON PURPOSE (a change from an earlier pass that briefly used a much brighter white card against a cream page): true neumorphism needs the raised/inset shadow itself to be what separates a surface from its parent, not a color jump — a card that's already visually distinct from its background barely needs the shadow at all, which defeats the point. `--foreground: #1B2E22`, `--muted-foreground: #5C6B5F`, `--primary: #2F5233` (buttons/links/focus rings) with `--primary-hover: #24401F` (a real hover token, not an opacity blend — Button's `default` variant uses `hover:bg-primary-hover`), `--accent-soft: #3D6B44` (a second, slightly lighter dark-green step used only for the Sidebar's active-item pill, so it reads as distinct from a `--primary` action button while still clearing WCAG AA against its white icon — see "Sidebar" below), `--border: #E3E8E1`, `--destructive` unchanged (red). shadcn's own generic `--accent`/`--accent-foreground` tokens (ghost-button hover, select-item highlight, non-active Sidebar icons) stay a neutral off-white/grey, deliberately **not** repainted green — only `--primary`/`--accent-soft` are the brand accent; an incidental hover (e.g. an Edit icon button) never flashes the same color as a real primary action or nav state.
- **Small micro-interactions** — hover states, 150–200ms transitions on buttons/cards make the UI feel responsive; all such transitions respect `prefers-reduced-motion` (collapsed to near-zero duration in `index.css`)
- **Consistent spacing scale** — use Tailwind's spacing scale (4px multiples) throughout; avoid arbitrary margin/padding values
- **One icon set across the app** — e.g. Lucide or Tabler icons; don't mix icon sets

### Card & control redesign (Employees / Products / Positions)
These three list pages moved from a bordered `<Table>` to a responsive grid of `NeumorphicCard`s (`CompanyListPage` is unchanged — still a small `<Table>`, out of scope for this pass). Clicking a card opens a read-only `*DetailDialog` (`EmployeeDetailDialog`/`ProductDetailDialog`/`PositionDetailDialog`) showing the full record via the shared `DetailRow` component; each card's own small icon Edit/Delete buttons and the detail dialog's larger Edit/Delete buttons both drive the *same* `EmployeeFormDialog`/`ProductFormDialog`/`PositionFormDialog` and `ConfirmDeleteDialog` instances in the parent page — there is exactly one edit form and one delete confirmation per page, not a duplicate per entry point. A permission-gated Edit/Delete button is never rendered in a disabled-but-visible state on these cards (it's simply absent when the caller's Position doesn't grant it, same as before); the one real "disabled" case — a submit button mid-request — flattens its shadow entirely (`disabled:shadow-none`) so it never reads as pressable.

### Sidebar (collapsible, single-column)
`Sidebar.tsx` is one `neu-raised` shape (see above): a single column of icon+label rows, full width by default, collapsing to an icon-only ~64px rail when toggled (the `PanelLeftClose`/`PanelLeftOpen` button at the top of the Sidebar). `collapsed` is plain `useState` in `AppLayout.tsx`, passed down as a prop — deliberately not persisted anywhere (no localStorage, no backend preference): it resets to expanded on every reload. An earlier pass briefly tried a fixed two-column "icon rail + section-title panel" layout instead; that was reverted in favor of this single column, which is what's actually shipped now.

Each row (`icon` + `label`) collapses its label to a `sr-only` span rather than dropping it outright, with the visible `<span>` swapped back in when expanded — both branches render exactly one real text node, so the row's accessible name (and this file's own tests, which query by that name) work identically whether collapsed or not; a `title` attribute mirrors the label as a mouse-hover tooltip only when collapsed, since the sighted-mouse case still benefits from a rollover hint even though it no longer carries the row's *accessible* name. The active item gets a raised (`neu-raised-sm`) pill in `--accent-soft` with white icon+label on top; a Position-gated item the caller can't reach renders as a non-interactive `aria-disabled` span (`NO_ACCESS_TITLE` tooltip) — both states behave identically collapsed or expanded, never just hidden. `focus-visible` on any row is a solid ring — never just relying on the pill's shadow to show where keyboard focus is.

Below the nav list, separated by a `border-t`, is `SettingsPopover.tsx` (gear icon + "Settings" label, collapsing the same way the nav rows do) — this replaced the old always-visible Topbar email + `LogoutButton`. Clicking it opens a `Popover` (`components/ui/popover.tsx`, hand-authored on `@radix-ui/react-popover`) showing `useAuth0().user?.email` and a "Sign out" button that calls `useAuth0().logout(...)` the same way `LogoutButton` always did. Email comes straight from the Auth0 SDK's session state, not a backend call, so it renders correctly even for a `super_admin` with no Employee/Position record at all (see CLAUDE.md § Authentication & Authorization). Radix's own `DismissableLayer` closes the popover on an outside click or Escape — no extra event-listener code was needed for that.

`LogoutButton.tsx` itself still exists and is still used — by `AccountNotProvisionedPage` and `SelectCompanyPage`, both of which render *outside* `AppLayout` entirely (no Sidebar, so no gear button reachable) and therefore still need their own standalone sign-out control. Only `Topbar.tsx`'s usage was removed; Topbar's only remaining job is the acting-as-company "Exit company view" control, so it renders nothing at all outside that mode.

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