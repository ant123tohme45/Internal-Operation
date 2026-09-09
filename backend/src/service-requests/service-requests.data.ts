/**
 * Operations Hub — reference data and in-memory shapes.
 *
 * This teaching project keeps its data in memory so it can run without a
 * database (see README.md "Non-goals"). In a real Operations Hub, Employee
 * and Service would come from their own tables.
 *
 * The shapes follow the model designed in Week 1 (../../../docs/data-model.md,
 * section 2.1):
 *
 *   Employee --submits--> ServiceRequest --requests--> Service
 *   ServiceRequest --has history--> RequestStatusEvent
 */
import { RequestStatus } from './status-transitions';

/** A known employee who can submit requests. Full Employee entity is out of
 * scope this week (no auth) — this is just enough to validate "known
 * employee" (data-model.md section 3, "Ownership"). */
export interface Employee {
  id: string;
  fullName: string;
  department: string;
}

/** A known catalog item a request can be made against. Full Service CRUD is
 * out of scope this week — this is just enough to validate "known service". */
export interface Service {
  id: string;
  name: string;
  departmentOwner: string;
}

export const EMPLOYEES: Employee[] = [
  { id: 'EMP-1', fullName: 'Rana Fares', department: 'Marketing' },
  { id: 'EMP-2', fullName: 'Omar Saade', department: 'Engineering' },
  { id: 'EMP-3', fullName: 'Dana Khalil', department: 'Finance' },
];

export const SERVICES: Service[] = [
  { id: 'SVC-1', name: 'Laptop replacement', departmentOwner: 'IT' },
  { id: 'SVC-2', name: 'Payroll correction', departmentOwner: 'Finance' },
  { id: 'SVC-3', name: 'Access badge reset', departmentOwner: 'HR' },
];

/** The central durable-state object (data-model.md section 2.1). */
export interface ServiceRequest {
  id: string;
  employeeId: string;
  serviceId: string;
  currentStatus: RequestStatus;
  createdAt: string;
}

/** One append-only row explaining how a request reached its current status
 * (data-model.md section 2.1; why it exists at all is ADR-001). */
export interface RequestStatusEvent {
  id: string;
  requestId: string;
  status: RequestStatus;
  changedBy: string; // employee id of the actor who made the change
  occurredAt: string; // ISO timestamp
  comment?: string;
}
