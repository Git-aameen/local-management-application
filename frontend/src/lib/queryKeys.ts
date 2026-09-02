// Shared React Query keys so features can invalidate/share cached data across feature
// boundaries without importing each other's hooks. Positions and Employees both read the
// same position list (features/positions/hooks.ts and features/employees/hooks.ts) — using
// the same key here is what makes a newly created position show up immediately in the
// Employee form's position dropdown, with no extra plumbing needed.
export const POSITIONS_QUERY_KEY = ['positions'] as const
export const EMPLOYEES_QUERY_KEY = ['employees'] as const
export const PRODUCTS_QUERY_KEY = ['products'] as const
export const COMPANIES_QUERY_KEY = ['companies'] as const
