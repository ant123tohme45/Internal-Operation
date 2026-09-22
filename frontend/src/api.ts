/**
 * Thin client for the Operations Hub backend's ServiceRequest API
 * (backend/src/service-requests). One function per endpoint, one shared
 * error type, so the UI layer never has to know about fetch/JSON plumbing —
 * matching data-model.md section 7's rule that the UI stays a display
 * layer, not a source of truth.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export type RequestStatus =
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface Employee {
  id: string;
  fullName: string;
  department: string;
}

export interface Service {
  id: string;
  name: string;
  departmentOwner: string;
  category?: string | null;
  keywords?: string[] | null;
}

/** The Week 4 AI-assisted Request Intake result (docs/week4-production-ai.md).
 * Advisory only — matching this shape exactly is what lets the UI treat
 * "no suggestion" as a normal, expected outcome rather than an error. */
export type IntakeSuggestion =
  | { matched: true; serviceId: string; confidence: number; rationale: string }
  | { matched: false; reason: string; detail?: string };

export interface ServiceRequest {
  id: string;
  employeeId: string;
  serviceId: string;
  currentStatus: RequestStatus;
  createdAt: string;
}

export interface RequestStatusEvent {
  id: string;
  requestId: string;
  status: RequestStatus;
  changedBy: string;
  occurredAt: string;
  comment?: string;
}

/** Thrown for every non-2xx response, carrying the backend's own message
 * and status code so the UI can show exactly what the API rejected and
 * why (invalid request, 403 authorization denial, 400 business rule, ...). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; employeeId?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.employeeId) {
    headers['X-Employee-Id'] = options.employeeId;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : (data?.message ?? `Request failed with status ${res.status}`);
    throw new ApiError(res.status, message);
  }

  return data as T;
}

export const api = {
  listEmployees: () => request<Employee[]>('/api/service-requests/reference/employees'),
  listServices: () => request<Service[]>('/api/service-requests/reference/services'),

  myRequests: (employeeId: string) =>
    request<ServiceRequest[]>(`/api/service-requests?employeeId=${encodeURIComponent(employeeId)}`),

  get: (id: string) => request<ServiceRequest>(`/api/service-requests/${id}`),

  createEmployee: (id: string, fullName: string, department: string) =>
    request<Employee>('/api/service-requests/reference/employees', {
      method: 'POST',
      body: { id, fullName, department },
    }),

  createService: (id: string, name: string, departmentOwner: string) =>
    request<Service>('/api/service-requests/reference/services', {
      method: 'POST',
      body: { id, name, departmentOwner },
    }),

  history: (id: string) => request<RequestStatusEvent[]>(`/api/service-requests/${id}/history`),

  submit: (employeeId: string, serviceId: string, comment: string) =>
    request<ServiceRequest>('/api/service-requests', {
      method: 'POST',
      employeeId,
      body: { serviceId, comment: comment || undefined },
    }),

  cancel: (id: string, employeeId: string) =>
    request<ServiceRequest>(`/api/service-requests/${id}/cancel`, {
      method: 'PATCH',
      employeeId,
    }),

  /** Browse/search the service catalog (product-spec.md's browse/search
   * requirement — a Week 2-3 gap closed in Week 4, see
   * docs/week4-production-ai.md). */
  searchServices: (q: string) =>
    request<Service[]>(`/api/service-requests/reference/services/search?q=${encodeURIComponent(q)}`),

  /** The Week 4 AI-assisted Request Intake capability: free text in,
   * at most one advisory candidate service out. Never creates or changes
   * anything — the employee still submits the request themselves. */
  suggestIntake: (text: string) =>
    request<IntakeSuggestion>('/api/service-requests/intake/suggest', {
      method: 'POST',
      body: { text },
    }),
};
