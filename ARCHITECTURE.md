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
        LoginPage.tsx        # single unified composition (centered panel + lava glow, not a split-screen — see § 6) -> loginWithPopup(), with a loginWithRedirect() fallback if the popup can't open; lives at /login
        LogoutButton.tsx     # Auth0 hosted logout() redirect
        ProtectedRoute.tsx   # gates a route on useAuth0().isAuthenticated, else -> /login; optionally also takes a requiredPermission prop (a boolean key of useMyPermissions()'s MyPermissions, e.g. "manage_employees") that renders AccessDeniedPage instead of the route when the check fails
        AccessDeniedPage.tsx # shown by ProtectedRoute's requiredPermission check — "you don't have permission", link back to /dashboard
        AccountNotProvisionedPage.tsx  # shown when the backend rejects a request with 403 ACCOUNT_NOT_PROVISIONED
        RequireActingCompanyForSuperAdmin.tsx  # mandatory full-screen gate: a super_admin with no acting company is bounced to /select-company
  /components/ui       # shadcn/ui primitives: Button, Input, Label, Select, Dialog, AlertDialog + ConfirmDeleteDialog (shared destructive-confirm used by all three delete flows), Popover (hand-authored on @radix-ui/react-popover, same pattern as Dialog — backs Sidebar's SettingsPopover; Radix's own DismissableLayer handles click-outside/Escape, no extra code needed) — Dialog/AlertDialog/Popover all share the same flat border-2/rounded-xl edge treatment, see § 6, ErrorDialog (global showErrorDialog(message) — centered, must-acknowledge, used by every mutation's onError; toast stays for onSuccess), Table (still used by CompanyListPage only — Employees/Positions/Products moved to a card grid, see § 6), Badge, Card (`card.tsx` — a flat bordered surface, renamed from NeumorphicCard once the shadow it was named for was removed; the Employees/Positions/Products card grids use it instead of a bordered table wrapper), DetailRow (flat label/value row for the read-only detail dialogs), Sonner (toasts, `theme="dark"` — fixed, never follows the OS setting), Pagination
  /components/layout   # Sidebar (collapsible push-layout column styled as a floating "modal panel" — see § 6; SettingsPopover.tsx, the gear row at the bottom, holds the user's email + Sign out instead of a persistent Topbar control), Topbar (acting-as-company "Exit company view" control only — renders nothing otherwise), AppLayout (wraps both + <Outlet/>, owns the Sidebar's collapsed state, styles the content area as its own floating panel too)
  /lib                 # axios/fetch client (apiClient + useApiClient, attaches Auth0 bearer token), query client, queryKeys.ts (shared React Query keys — companies/employees/positions/products — so e.g. positions + employees can invalidate/share one cached position list), errors.ts (getApiErrorMessage), utils.ts (cn), formatters.ts (formatCurrency — Intl.NumberFormat USD)
  /hooks               # shared hooks (useDebounce, usePagination)
  /context             # CompanyContext (currently selected company)
```

**shadcn/ui setup:** hand-authored (not CLI-generated, to keep the non-interactive build predictable) — `components.json` at the repo root, `@/*` path alias (`vite.config.ts` + `tsconfig.app.json`), CSS variables + `@theme inline` in `index.css` (dark mode only — a flat "molten lava" palette, no shadow tokens at all — see § 6), `cn()` in `lib/utils.ts`, `Inter Variable` (`@fontsource-variable/inter`, body/data) paired with `Space Grotesk Variable` (`@fontsource-variable/space-grotesk`, headings/labels via the `font-display` utility) as the app-wide fonts. Underlying deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-*` (slot/label/select/dialog), `sonner` (toasts).

**Routes implemented so far:** `/` (redirects straight to `/login`, no landing page content of its own), `/login` (LoginPage — a single unified composition, not a split-screen, a single "Log In" button that calls `loginWithPopup()` (falling back to `loginWithRedirect()` if the popup can't open — see § 5); an already-authenticated visitor is redirected onward from here via `useAuth0().isAuthenticated`), and — behind `ProtectedRoute` + `AppLayout` (Sidebar/Topbar shell) — `/dashboard` (auth proof-of-flow placeholder), `/companies` (super_admin only — see "Role-based UI"; simple list, not paginated; create/edit dialog is a single `name` field; no delete action — deleting a company would cascade-affect all its employees/products/positions, deliberately not exposed in the UI yet), `/employees` (route-gated on `manage_employees` too — `<ProtectedRoute requiredPermission="manage_employees">`, see "Role-based UI"; full CRUD: card grid + pagination (clicking a card opens `EmployeeDetailDialog`, a read-only view with its own Edit/Delete buttons — the card's own inline icon buttons do the same thing without opening it first), create/edit dialog with React Hook Form + Zod, position dropdown, toast on success / centered `ErrorDialog` on failure; salary is shown — and, since `useMyPermissions().view_salary` is granted per-Position now, editable — solely for whoever's own Position grants it, formatted via `formatCurrency()`; see "Role-based UI" and CLAUDE.md § Sensitive Data Handling), `/positions` (route-gated on `manage_positions` too — `requiredPermission="manage_positions"`; card grid, not paginated; click a card for `PositionDetailDialog`; create/edit dialog has `name` plus five `manage_*`/`view_salary` checkboxes set directly on the Position — no shared "Grade" concept anymore (retired — see § 4) — deleting a position that's still assigned to any employees is rejected by the backend with 409 `POSITION_IN_USE`, surfaced here via `ErrorDialog` — no separate pre-check query needed), `/products` (full CRUD: card grid + category filter dropdown + pagination, click a card for `ProductDetailDialog`; create/edit dialog with React Hook Form + Zod — quantity is validated client-side as well as server-side, price is a Decimal field that serializes as a JSON *string* on the wire so the frontend parses it with `Number()` for display/math — items under 10 in stock show a "Low stock" Badge, on both the card and the detail dialog).

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

1. The user visits `/`, which redirects straight to `/login` (`<Navigate to="/login" replace />` in `App.tsx`) — a single unified composition (centered panel, single "Log In" button — see § 6), not a split-screen
2. Clicking "Log In" calls `loginWithPopup()` (`@auth0/auth0-react`'s `useAuth0()`), which opens Auth0's hosted Universal Login in a popup window rather than navigating the whole page away — the frontend never sees or handles a password itself, and the main app window never unmounts
3. Auth0 authenticates the user in the popup (including its own hosted "Forgot password" link, adaptive MFA, and breached-password/brute-force protection); the Auth0 SDK in the opener window polls the popup's URL for the callback (`code`/`state`) and completes the token exchange client-side (PKCE — no client secret involved, since this is a public SPA client), then closes the popup
4. If the popup can't complete — blocked by the browser or an extension, closed early by the user, timed out — `LoginPage.tsx` catches the failure and shows an inline message with a "Continue without a popup" button that falls back to `loginWithRedirect()`, a full-page redirect through the same Auth0 flow that every browser allows unconditionally
5. `ProtectedRoute.tsx` gates every non-`/login` route on `useAuth0().isAuthenticated`; `LoginPage.tsx` itself redirects an already-authenticated visitor onward via `getPostLoginRedirectPath(role)` — straight to `/dashboard`, or `/select-company` for `super_admin` — no intermediate landing/click-through page, regardless of which of the two flows completed the login
6. The frontend attaches the access token as `Authorization: Bearer <token>` on every API call (`lib/apiClient.ts`, via `getAccessTokenSilently()`); it reads `role` (for `super_admin` only — see below) from the ID token's custom claim (`useAuth0().user`) and the standard OIDC `email` claim for display in the Sidebar's `SettingsPopover` (see § 6), which is separate from the custom, namespaced email claim the backend uses
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
- **Two-family type pairing** — `Space Grotesk Variable` (`@fontsource-variable/space-grotesk`, `font-display` utility) for headings, page titles, dialog titles, button/nav labels, and Sidebar labels — a geometric, slightly industrial face with enough character to hold up against the black+lava palette. `Inter Variable` (`@fontsource-variable/inter`, `font-sans`, the body default) stays for table/card data and form fields, which need tabular-figure legibility more than personality.
- **Flat design — no shadow-based elevation anywhere** — a full redesign replaced the previous soft-neumorphism system entirely. `--shadow-light`/`--shadow-dark` and every `.neu-raised`/`.neu-raised-sm`/`.neu-pressed-sm`/`.neu-inset-sm` utility have been deleted from `index.css`, along with `Button`'s `elevated` prop. Hierarchy now comes from three things only: **flat color steps** (`--background` → `--surface` → `--surface-alt`), **1-2px borders** at every real edge, and **scale/weight** (Space Grotesk bold titles vs. Inter regular body). Corners are sharp/angular rather than softly rounded — `--radius` dropped from `0.625rem` to `0.25rem`, and the two main panels (Sidebar + content) moved from `rounded-2xl`/`shadow-xl` to `rounded-md`/`border`.
- **Dark mode only, by design** — the reverse of the previous light-only rule, for the same reason: no theme toggle, no `prefers-color-scheme` query, `color-scheme: dark` set explicitly on `:root`. Every color still lives in a CSS variable in `index.css`, not hardcoded in components, which is what made this full repaint possible without touching most component files (see the palette section below).
- **Palette: "molten lava" — deep black/charcoal surfaces, a two-tone lava accent** — chosen over a flat single orange specifically so the accent has depth (see the accent bullet below). Full token table:

  | Token | Hex | Role |
  |---|---|---|
  | `--background` | `#0D0B0A` | Page gutter (`AppLayout`'s outer wrapper, `LoginPage`/`AccountNotProvisionedPage`/`SelectCompanyPage`'s body background) |
  | `--surface` | `#1C1714` | Sidebar + content panel fill (`--panel`/`--panel-foreground` alias to this) |
  | `--surface-alt` | `#2D2521` | Cards/tables/dialogs/popovers inside the panel (`--card`/`--popover`/`--secondary` alias to this) |
  | `--text-primary` | `#F5EDE8` | Warm off-white body/heading text (`--foreground` alias) |
  | `--text-secondary` | `#A69A93` | Muted labels/meta text (`--muted-foreground` alias) |
  | `--accent` | `#E8491A` | Lava — primary buttons, active states, links (`--primary` alias) |
  | `--accent-hot` | `#FF8A3D` | Hotter lava — hover states, and the app's one focus-ring color (`--ring` alias) |
  | `--accent-ember` | `#B8300D` | Deep ember — **decorative only** (the gradient seam below); never a text background, since it fails AA with either light or dark text |
  | `--accent-foreground` | `#0D0B0A` | Text/icons on `--accent`/`--accent-hot` (dark, not white — see contrast table) |
  | `--border` | `#3A3128` | Decorative dividers — card/table/panel edges |
  | `--border-strong` | `#7D7167` | Boundaries WCAG 1.4.11 actually governs — input/select default borders, `outline`-variant buttons (`--input` alias) |
  | `--disabled-text` | `#6B615C` | Disabled Sidebar-item labels (`--disabled-foreground` alias) |
  | `--destructive` | `#B33A3A` | Delete actions — a cooler, more muted red than the lava accent, so "delete" never reads as a lava variant |
  | `--destructive-foreground` | `#F5EDE8` | Light text on `--destructive` fills (badges, the Delete button) |
  | `--destructive-light` | `#E85A50` | Brighter red for error **text** with no fill of its own (form validation messages, "Failed to load…" states) — see contrast table for why this is a separate token from `--destructive` |

  **WCAG AA contrast, verified for every pairing actually used** (4.5:1 body text / 3:1 large text & non-text UI boundaries):

  | Pairing | Ratio | Verdict |
  |---|---|---|
  | `--text-primary` vs `--surface` / `--surface-alt` / `--background` | 15.4:1 / 13.0:1 / 17.0:1 | Pass |
  | `--text-secondary` vs `--surface` / `--surface-alt` / `--background` | 6.5:1 / 5.5:1 / 7.2:1 | Pass |
  | `--accent-foreground` (dark) on `--accent` | 5.0:1 | Pass |
  | `--text-primary` (white) on `--accent` | 3.4:1 | **Fails** — this is why lava buttons use dark text, not white |
  | `--accent-foreground` (dark) on `--accent-hot` | 8.4:1 | Pass |
  | `--accent-hot` as a ring color vs `--surface` / `--surface-alt` / `--background` | 7.7:1 / 6.4:1 / 8.4:1 | Pass (non-text 3:1) |
  | `--destructive-foreground` (light) on `--destructive` | 5.1:1 | Pass — the opposite pairing rule from `--accent`, worth remembering |
  | `--accent-foreground` (dark) on `--destructive` | 3.4:1 | Fails — confirms destructive buttons need light text, not dark |
  | `--destructive` fill vs `--surface` (button/badge edge) | 3.1:1 | Pass (non-text 3:1) |
  | Plain `--destructive` as **text** vs `--surface-alt` / `--surface` / `--background` | 2.6:1 / 3.0:1 / 3.4:1 | **Fails everywhere** — plain `--destructive` only ever worked as a white-on-red fill; every standalone error message across the app (form validation, list-page/table load errors, the login popup-blocked notice) was moved to `--destructive-light` instead |
  | `--destructive-light` vs `--surface-alt` / `--surface` / `--background` | ~4.3:1 / ~5.1:1 / ~5.7:1 | Pass |
  | `--border-strong` vs `--surface-alt` | 3.17:1 | Pass (non-text 3:1) — this is why it's a separate token from the decorative `--border` (~1.4–1.8:1, fine for a card edge, not for a boundary WCAG actually governs) |
  | `--disabled-text` vs `--surface` | 3.0:1 | Acceptable — WCAG 1.4.3 exempts inactive-control text from the AA minimum; this is an intentional "not interactive" signal |
  | `--background` vs `--surface` vs `--surface-alt` (region backgrounds) | ~1.1–1.2:1 | Not a WCAG SC (1.4.11 governs UI-component boundaries and focus indicators, not generic region separation) — real dark-mode UIs (Discord, Linear, GitHub dark) sit in the same band; every panel/card edge also gets a real `--border` line so the boundary never depends on the color-step alone |

  **Naming note**: `--accent`/`--accent-foreground` double as shadcn's generic hover-highlight slot (`hover:bg-accent hover:text-accent-foreground` on ghost/outline buttons, `focus:bg-accent` on select items) — hovering those now genuinely glows lava, which is the point of this palette rather than a naming coincidence. `--primary`/`--primary-foreground`/`--primary-hover` alias to `--accent`/`--accent-foreground`/`--accent-hot`, so every button, link, and active state that used to be dark green is lava automatically, with no changes needed at most call sites. `--muted` is a subtle warm charcoal (`#3D342E`, not `--accent-hot`) used at `/70` opacity for table-row hover — a lava hover wash was tested and rejected (drops text contrast to ~2.3:1 on hover, failing AA); the Sidebar's own icon-tile hover uses `bg-accent-hot/20` deliberately, a context where the icon (not body text) is the only thing that needs to stay legible.

  **Design principles that make this "lava," not "dark UI + orange accent":** the accent is asymmetric — it only appears on active/primary states (active nav tile, primary buttons, links, focus rings), never as a wash color; there are always two adjacent lava tones in play (`--accent` → `--accent-hot` on every hover/focus transition, never a flat single-tone swap); dark text on lava / light text on destructive-red is a deliberate, verified-by-contrast asymmetry that also makes "primary" and "delete" *feel* different, not just differently colored; corners are sharp (2-4px), never soft; and a single 2px `linear-gradient(90deg, --accent-ember, --accent, --accent-hot)` seam runs across the top of both the Sidebar and the content panel (`AppLayout.tsx`, `Sidebar.tsx`) — the one place in the app allowed to show all three lava tones at once, kept to exactly that one spot so it reads as a signature, not noise.
- **Small micro-interactions** — hover states, 150–200ms transitions on buttons/cards make the UI feel responsive; all such transitions respect `prefers-reduced-motion` (collapsed to near-zero duration in `index.css`)
- **Consistent spacing scale** — use Tailwind's spacing scale (4px multiples) throughout; avoid arbitrary margin/padding values
- **One icon set across the app** — e.g. Lucide or Tabler icons; don't mix icon sets

### Card & control redesign (Employees / Products / Positions)
These three list pages use a responsive grid of `Card`s (`components/ui/card.tsx` — renamed from `NeumorphicCard` when the shadow system it was named for was removed; same flat `--surface-alt` fill, now a border instead of a shadow pair). `CompanyListPage` is the one list page that still renders a bare `<Table>`, wrapped in its own explicit `bg-card border-border` surface in the page itself (`Table`/`TableRow`/`TableCell` carry no background of their own). Clicking a card opens a read-only `*DetailDialog` (`EmployeeDetailDialog`/`ProductDetailDialog`/`PositionDetailDialog`) showing the full record via the shared `DetailRow` component; each card's own small icon Edit/Delete buttons and the detail dialog's larger Edit/Delete buttons both drive the *same* `EmployeeFormDialog`/`ProductFormDialog`/`PositionFormDialog` and `ConfirmDeleteDialog` instances in the parent page — there is exactly one edit form and one delete confirmation per page, not a duplicate per entry point. A permission-gated Edit/Delete button is never rendered in a disabled-but-visible state on these cards (it's simply absent when the caller's Position doesn't grant it).

### Sidebar (collapsible push-layout, flat panel styling)
`Sidebar.tsx` is a persistent, collapsible push-layout column. `AppLayout.tsx` owns `collapsed` as plain `useState`, passed down as a prop; toggling it animates both the Sidebar's own width (`w-56` ↔ `w-16`, `transition-[width] duration-200`) and, implicitly, how much width is left for the content panel next to it (a flex row, so the two are always complementary — no overlay, nothing covers anything else). The toggle button (`PanelLeftClose`/`PanelLeftOpen`, swapping with the state) lives in a fixed header row at the top of the Sidebar itself, so it's never hidden or scrolled away in either state.

Both the Sidebar and the main content area are flat `--surface` fills on the near-black `--background`, separated by a real `gap-4` plus their own `border border-border` edge — no shadow, no elevation: `AppLayout.tsx` wraps them in a `flex gap-4 bg-background` row (**no outer padding** — both panels go edge-to-edge on their own outer sides, Sidebar flush top/left/bottom and the content panel flush top/right/bottom; `gap-4` is the only spacing left, and it only ever separates the two panels from each other), and each of the two children is `rounded-md border border-border bg-panel`. **Deliberately two distinct panels with a visible gap between them, not one continuous zone divided by an internal border** — same reasoning as before, just without a shadow to lean on: the color-step between `--background` and `--surface` is modest by design (see the contrast table above), so the real border line is what actually defines each panel's edge now, not a supporting cue alongside elevation.

### Main content area — page content sits directly on `--panel`
`<Outlet/>` renders directly inside the content panel's `p-6` `<main>`, with no shared wrapper — each page supplies its own `--surface-alt` (`bg-card`) surfaces only where it has dense content (a `Card` grid, the Companies table), while its own chrome — headings, "Loading…"/empty-state text, filter labels, buttons — sits directly on `--panel` using `text-panel-foreground` (full) or `text-panel-foreground/70` (secondary). This was audited page-by-page in an earlier pass and carries forward unchanged by this redesign except for the color values themselves and one correction the new palette surfaced:
- **`DashboardPage.tsx`**: `<h1>` → `text-panel-foreground` (`font-display`); status lines → `text-panel-foreground/70`. `SummaryCard` renders through `Card` (explicit `bg-card`).
- **`EmployeeListPage.tsx` / `PositionListPage.tsx` / `ProductListPage.tsx`**: page `<h1>` (`font-display`) → `text-panel-foreground`; "Loading…"/empty-state text → `text-panel-foreground/70`; load-error text → `text-destructive-light`; "New Employee/Position/Product" buttons use the plain default `Button` variant (lava fill, no per-instance override needed — see below). `SimplePagination`'s "Page X of Y" label is `text-panel-foreground/70`, scoped to just the label, not its container — its Previous/Next buttons are `variant="outline"` (`bg-surface-alt`, self-contained) and must keep their own inherited text color regardless of the label's.
- **`CompanyListPage.tsx`**: same `<h1>`/button treatment; its bare `<Table>` is wrapped in `overflow-hidden rounded-lg border border-border bg-card`.
- **Correction this pass made**: plain `text-destructive` as standalone text (not a button/badge fill) fails AA against every dark surface in this palette (2.6–3.4:1, see the contrast table) — it only ever worked as white-on-red-fill. Every inline form-validation message (`EmployeeFormDialog`, `ProductFormDialog`, `PositionFormDialog`, `CompanyFormDialog`), `PermissionOverrideSection`'s error line, `LoginPage`'s popup-blocked notice, and the Companies/`SelectCompanyPage` table error rows were all moved to `text-destructive-light`.

**A note on why most page/component files needed no structural changes for this redesign**: `--panel`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--ring`, `--input`, `--disabled-foreground` all still exist as token *names* — they're now aliases onto the new lava/black values (`--panel` → `--surface`, `--card` → `--surface-alt`, `--primary` → `--accent`, etc., see the palette table above). A component written against `bg-panel` or `bg-card` or `bg-primary` automatically repainted to the new palette; only components with a hardcoded shadow/neumorphism class, a now-retired token (`--accent-bright`, `--accent-soft`, `--page-background` — all removed), or a color pairing the new dark-on-dark math actually broke (`text-destructive` above; the `outline` Button variant, below) needed a real edit.

`Topbar.tsx` also renders directly on `--panel` (only visible in acting-as-company mode) — its outline button (`bg-surface-alt` + `border-border-strong`) reads as a raised neutral chip regardless of what's behind it, the same way Sidebar's icon tiles do. Note: the `outline` `Button` variant itself needed a real fix in this pass — it used to fill with `bg-background`, which was the *lightest* token in the old light-mode palette; in the new dark-mode palette `--background` is the *darkest* layer, so the same class would have made outline buttons look recessed/invisible instead of raised. It now fills with `bg-surface-alt` instead.

Each nav row separates the icon from the label visually: the icon sits in its own small rounded tile (`size-8 rounded-lg`), the label is plain text beside it (hidden to `sr-only` when collapsed, with a `title` tooltip on hover in that state). The tile's color is the whole state signal:
- **Default (enabled, not active):** a flat neutral tile — `bg-secondary` (`--surface-alt`) + `border-border` — its own real fill and edge, not a shadow cue.
- **Hover (enabled, not active):** a translucent `bg-accent-hot/20` wash, borderless — a step toward the active lava fill without being confused for it. Solid lava is reserved for the truly active item.
- **Active:** the tile switches to solid `bg-accent` (lava) with `text-accent-foreground` (dark, ~5.0:1 — white-on-lava was tested and rejected at ~3.4:1, see the contrast table).
- **Disabled (no Position grant):** the exact same neutral tile as the enabled default state — never lava, never the hover wash. The label uses `text-disabled-foreground` (`--disabled-text`, ~3.0:1 against `--panel` — acceptable per WCAG's inactive-control-text exemption). Rendered as a non-interactive `aria-disabled` span with a `NO_ACCESS_TITLE` tooltip and no `href` at all, same fail-closed pattern as always.

An enabled, non-active item's label uses `text-panel-foreground` (warm off-white) — it sits directly on `--panel`, no card underneath it.

`focus-visible` on a row, the collapse toggle, and the Settings trigger is a solid `ring-2 ring-ring ring-offset-2 ring-offset-panel` — `--ring` aliases to `--accent-hot`, so the one focus-ring color in the app is always the brightest lava tone, easily clearing 3:1 against every surface (see the contrast table). This is also now the `Button` component's own base focus-ring class, so no per-instance override is needed for buttons that happen to render directly on `--panel` (an earlier pass had to hand-add `ring-panel-foreground`/`ring-offset-panel` to specific buttons for exactly this reason — that workaround is gone because the new palette's `--ring` is safe everywhere by construction).

Below the nav list, separated by a `border-t`, is `SettingsPopover.tsx` (gear icon + "Settings" label, collapsing the same way the nav rows do). Clicking it opens a `Popover` (`components/ui/popover.tsx`, hand-authored on `@radix-ui/react-popover`, flat `border border-border bg-card`, no shadow) showing `useAuth0().user?.email` and a plain `outline`-variant "Sign out" button that calls `useAuth0().logout(...)`. Email comes straight from the Auth0 SDK's session state, not a backend call, so it renders correctly even for a `super_admin` with no Employee/Position record at all (see CLAUDE.md § Authentication & Authorization). Radix's own `DismissableLayer` closes the popover on an outside click or Escape.

`LogoutButton.tsx` itself still exists and is still used — by `AccountNotProvisionedPage` and `SelectCompanyPage`, both of which render *outside* `AppLayout` entirely (no Sidebar, so no gear button reachable) and therefore still need their own standalone sign-out control. `Topbar.tsx` holds only the acting-as-company "Exit company view" control, rendering nothing at all outside that mode.

### Login page (single composition, not a split-screen)
`LoginPage.tsx` was redesigned away from the earlier two-column layout (branding left, login button right) to a single unified composition, on the reasoning that a backoffice login should read as a fast, single-purpose gate — one glance at the brand mark, one button, nothing to scroll past — not a marketing hero. The page is a full-bleed `bg-background` with a centered `bg-panel` card (`rounded-md border border-border`, the same treatment as any other panel in the app) carrying the same 2px lava gradient seam used on the Sidebar/content panel, plus a soft blurred radial glow behind it (`radial-gradient(circle, var(--accent-ember) 0%, var(--accent) 45%, transparent 72%)`, `blur-3xl`, low opacity, `aria-hidden`) — existing lava tones only, no new hues. The card is deliberately large (`max-w-3xl`, generous padding) to anchor the composition. The brand heading ("Local Management Application") uses a fluid `clamp()`-based `font-size` (not a fixed `text-4xl`/`text-6xl` breakpoint step) so it always renders on a single line without wrapping or overflowing, at any viewport width, down to mobile — a fixed size that fits one width inevitably wraps or clips at another, since the phrase is long (28 characters) relative to typical card widths. The single "Log In" button and the popup-blocked fallback block are functionally unchanged (`loginWithPopup()` with a `loginWithRedirect()` fallback — see § 5) and capped at `max-w-sm` inside the wider card so they don't stretch edge-to-edge.

### Modals & popover — shared edge treatment
`Dialog`, `AlertDialog`, and `Popover` (`components/ui/dialog.tsx`/`alert-dialog.tsx`/`popover.tsx`) all share one deliberately more pronounced edge than the app's ordinary flat surfaces: `border-2 border-border` and `rounded-xl`, versus the `border border-border`/`rounded-md` used for panels and cards elsewhere. This is applied once, in each shared component's own className, not per call site — every create/edit form dialog, the `ConfirmDeleteDialog`, the `ErrorDialog`, and the Sidebar's `SettingsPopover` all inherit it automatically. The reasoning: a modal's edge should read as a firm, deliberate boundary since it's the one thing floating disconnected from the rest of the flat layout (no shadow to signal "this is elevated above the page"), while an ordinary panel/card edge can stay closer to the app's baseline flat treatment.

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