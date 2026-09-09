import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EMPLOYEES, SERVICES, ServiceRequest, RequestStatusEvent } from './service-requests.data';
import {
  RequestStatus,
  REQUEST_STATUSES,
  canTransition,
  explainRejectedTransition,
} from './status-transitions';

@Injectable()
export class ServiceRequestsService {
  // In-memory store (README.md "Non-goals": no real database this week).
  // The rules below — ownership, valid transitions, append-only history —
  // do not depend on that; they'd hold the same way against a real database.
  private readonly requests: ServiceRequest[] = [];
  private readonly events: RequestStatusEvent[] = [];
  private nextRequestNumber = 1001;
  private nextEventNumber = 1;

  /** Submits a new request. Always starts in "SUBMITTED" (data-model.md section 3). */
  createRequest(employeeId: string, serviceId: string, comment?: string): ServiceRequest {
    if (!employeeId || !serviceId) {
      throw new BadRequestException('Both "employeeId" and "serviceId" are required.');
    }

    if (!EMPLOYEES.some((employee) => employee.id === employeeId)) {
      throw new BadRequestException(
        `"${employeeId}" is not a known employee id. Known ids: ${EMPLOYEES.map((e) => e.id).join(', ')}.`,
      );
    }

    if (!SERVICES.some((service) => service.id === serviceId)) {
      throw new BadRequestException(
        `"${serviceId}" is not a known service id. Known ids: ${SERVICES.map((s) => s.id).join(', ')}.`,
      );
    }

    const request: ServiceRequest = {
      id: `REQ-${this.nextRequestNumber++}`,
      employeeId,
      serviceId,
      currentStatus: 'SUBMITTED',
      createdAt: new Date().toISOString(),
    };
    this.requests.push(request);
    this.appendEvent(request, 'SUBMITTED', employeeId, comment);

    return request;
  }

  /** "My requests" access pattern (data-model.md section 5) when employeeId is given. */
  findAll(employeeId?: string): ServiceRequest[] {
    if (!employeeId) {
      return this.requests;
    }
    return this.requests.filter((request) => request.employeeId === employeeId);
  }

  findOne(id: string): ServiceRequest {
    const request = this.requests.find((item) => item.id === id);
    if (!request) {
      throw new NotFoundException(`No service request found with id "${id}".`);
    }
    return request;
  }

  /** Full status history, oldest first (data-model.md section 5, "full history" access pattern). */
  getHistory(id: string): RequestStatusEvent[] {
    this.findOne(id); // throws 404 if the request itself doesn't exist
    return this.events
      .filter((event) => event.requestId === id)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  /** The state-transition behaviour this milestone is about. */
  changeStatus(
    id: string,
    status: RequestStatus,
    changedBy: string,
    comment?: string,
  ): ServiceRequest {
    if (!status || !changedBy) {
      throw new BadRequestException('Both "status" and "changedBy" are required.');
    }

    if (!REQUEST_STATUSES.includes(status)) {
      throw new BadRequestException(
        `"${status}" is not a valid request status. Valid statuses: ${REQUEST_STATUSES.join(', ')}.`,
      );
    }

    if (!EMPLOYEES.some((employee) => employee.id === changedBy)) {
      throw new BadRequestException(
        `"${changedBy}" is not a known employee id, so this change cannot be attributed to anyone.`,
      );
    }

    const request = this.findOne(id);

    if (!canTransition(request.currentStatus, status)) {
      throw new BadRequestException(explainRejectedTransition(request.currentStatus, status));
    }

    // Invariant (ADR-001): current_status and the event history are updated
    // together, in the same operation, so they can never drift apart.
    request.currentStatus = status;
    this.appendEvent(request, status, changedBy, comment);

    return request;
  }

  private appendEvent(
    request: ServiceRequest,
    status: RequestStatus,
    changedBy: string,
    comment?: string,
  ): void {
    // Invariant (data-model.md section 3, "History"): status changes are
    // never overwritten in place — always push a new row, never mutate one.
    this.events.push({
      id: `EVT-${this.nextEventNumber++}`,
      requestId: request.id,
      status,
      changedBy,
      occurredAt: new Date().toISOString(),
      comment,
    });
  }
}
