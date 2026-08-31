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
    /employees
      components/      # UI specific to this feature
      hooks/            # useEmployees, useEmployeeForm, etc.
      api.ts            # calls to the employees backend endpoints
      types.ts
    /products
      components/
      hooks/
      api.ts
      types.ts
    /auth
      AuthProvider.tsx  # wraps the Auth0 SDK
      hooks.ts
  /components/ui       # design system: Button, Input, Card, Table, Modal, etc.
  /components/layout   # Sidebar, Topbar, PageContainer
  /lib                 # axios/fetch client, query client, formatters
  /hooks               # shared hooks (useDebounce, usePagination)
  /context             # CompanyContext (currently selected company)
```

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
```

**Key principles:**
- **Layered architecture**: Router → Service → Repository/ORM. Business logic never lives directly in the route handler, which keeps testing and maintenance easier
- **FastAPI dependency injection** extracts `current_user` and `current_company` from the JWT and passes them into the service layer automatically for every endpoint — preventing accidental omission of the `company_id` filter
- **Async-first**: endpoints and database calls are `async def` to handle concurrent requests efficiently

---

## 4. Data Layer (PostgreSQL)

**Multi-tenant strategy: shared table + `company_id`**

```sql
companies
  id (PK)
  name
  created_at

employees
  id (PK)
  company_id (FK → companies.id)  -- every query must filter on this column
  full_name
  position
  salary
  hired_at

products
  id (PK)
  company_id (FK → companies.id)
  category
  quantity
  price
```

- Index `company_id` on every table for query performance
- Consider **PostgreSQL Row-Level Security (RLS)** as a second layer of defense on top of service-layer filtering — if the service layer ever forgets to filter, RLS prevents cross-tenant data leakage

---

## 5. Authentication Flow (Auth0 / OAuth2)

1. The user clicks "Log in" → the React SPA redirects to Auth0's Universal Login
2. After a successful login, Auth0 redirects back with an authorization code
3. The frontend exchanges the code for an **access token (JWT)** via the Auth0 SDK
4. Every API call from the frontend attaches the JWT in the `Authorization: Bearer <token>` header
5. The backend extracts `company_id` and `role` from the JWT claims (custom claims configured via Auth0 rules/actions)

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