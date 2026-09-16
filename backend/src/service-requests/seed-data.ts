/**
 * Fixed seed rows for Employee and Service. Week 2 kept these as in-memory
 * arrays that doubled as the "database". Week 3 moves real data into SQLite
 * (see service-requests.module.ts's seeding on startup) — this file is now
 * only the seed list, not the storage.
 */
import { Employee } from './entities/employee.entity';
import { Service } from './entities/service.entity';

export const EMPLOYEE_SEED: Employee[] = [
  { id: 'EMP-1', fullName: 'Rana Fares', department: 'Marketing' },
  { id: 'EMP-2', fullName: 'Omar Saade', department: 'Engineering' },
  { id: 'EMP-3', fullName: 'Dana Khalil', department: 'Finance' },
];

export const SERVICE_SEED: Service[] = [
  { id: 'SVC-1', name: 'Laptop replacement', departmentOwner: 'IT' },
  { id: 'SVC-2', name: 'Payroll correction', departmentOwner: 'Finance' },
  { id: 'SVC-3', name: 'Access badge reset', departmentOwner: 'HR' },
];
