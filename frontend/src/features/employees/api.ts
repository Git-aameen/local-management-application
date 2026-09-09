import type { AxiosInstance } from 'axios'

import type {
  Employee,
  EmployeeCreateInput,
  EmployeeSpecialPermissions,
  EmployeeSpecialPermissionsUpdateInput,
  EmployeeUpdateInput,
  Paginated,
  Position,
} from './types'

export async function listEmployees(
  client: AxiosInstance,
  page: number,
  pageSize: number,
): Promise<Paginated<Employee>> {
  const res = await client.get('/api/v1/employees', { params: { page, page_size: pageSize } })
  return res.data.data
}

// Positions belong to the HR domain alongside employees (see ARCHITECTURE.md), and the
// employee form is their only consumer today, so listing them lives here rather than in a
// separate features/positions module. page_size=100 covers a company's whole position list
// for the dropdown; revisit if a company ever needs more than that.
export async function listPositions(client: AxiosInstance): Promise<Position[]> {
  const res = await client.get('/api/v1/positions', { params: { page: 1, page_size: 100 } })
  return res.data.data.items
}

export async function createEmployee(
  client: AxiosInstance,
  input: EmployeeCreateInput,
): Promise<Employee> {
  const res = await client.post('/api/v1/employees', input)
  return res.data.data
}

export async function updateEmployee(
  client: AxiosInstance,
  id: number,
  input: EmployeeUpdateInput,
): Promise<Employee> {
  const res = await client.put(`/api/v1/employees/${id}`, input)
  return res.data.data
}

export async function deleteEmployee(client: AxiosInstance, id: number): Promise<void> {
  await client.delete(`/api/v1/employees/${id}`)
}

// Restricted server-side to callers who are system role "admin" or hold an Admin-grade
// ("A") position — see require_admin_role_or_admin_grade() in app/core/dependencies.py.
// The frontend never enforces this itself; it just hides the section using
// useMyPermissions().can_manage_special_permissions (see SpecialPermissionsSection.tsx).
export async function getEmployeeSpecialPermissions(
  client: AxiosInstance,
  employeeId: number,
): Promise<EmployeeSpecialPermissions> {
  const res = await client.get(`/api/v1/employees/${employeeId}/special-permissions`)
  return res.data.data
}

export async function updateEmployeeSpecialPermissions(
  client: AxiosInstance,
  employeeId: number,
  input: EmployeeSpecialPermissionsUpdateInput,
): Promise<EmployeeSpecialPermissions> {
  const res = await client.put(`/api/v1/employees/${employeeId}/special-permissions`, input)
  return res.data.data
}
