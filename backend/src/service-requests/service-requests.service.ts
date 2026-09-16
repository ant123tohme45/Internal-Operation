import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { Service } from './entities/service.entity';
import { ServiceRequestEntity } from './entities/service-request.entity';
import { RequestStatusEventEntity } from './entities/request-status-event.entity';
import {
  RequestStatus,
  REQUEST_STATUSES,
  canCancel,
  canTransition,
  explainRejectedTransition,
} from './status-transitions';

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(ServiceRequestEntity)
    private readonly requests: Repository<ServiceRequestEntity>,
    @InjectRepository(RequestStatusEventEntity)
    private readonly events: Repository<RequestStatusEventEntity>,
  ) {}

  /** Submits a new request. Always starts in "SUBMITTED" (data-model.md section 3).
   * The owner is the acting identity (X-Employee-Id), not a body field — an
   * employee can only ever submit a request on their own behalf. */
  async createRequest(
    employeeId: string,
    serviceId: string,
    comment?: string,
  ): Promise<ServiceRequestEntity> {
    if (!serviceId) {
      throw new BadRequestException('"serviceId" is required.');
    }

    const employee = await this.employees.findOneBy({ id: employeeId });
    if (!employee) {
      const known = (await this.employees.find()).map((e) => e.id).join(', ');
      throw new BadRequestException(
        `"${employeeId}" is not a known employee id. Known ids: ${known}.`,
      );
    }

    const service = await this.services.findOneBy({ id: serviceId });
    if (!service) {
      const known = (await this.services.find()).map((s) => s.id).join(', ');
      throw new BadRequestException(
        `"${serviceId}" is not a known service id. Known ids: ${known}.`,
      );
    }

    const request = this.requests.create({
      id: await this.nextRequestId(),
      employeeId,
      serviceId,
      currentStatus: 'SUBMITTED',
      createdAt: new Date().toISOString(),
    });
    await this.requests.save(request);
    await this.appendEvent(request, 'SUBMITTED', employeeId, comment);

    return request;
  }

  /** Reference data for the frontend's identity switcher and service picker. */
  listEmployees(): Promise<Employee[]> {
    return this.employees.find();
  }

  listServices(): Promise<Service[]> {
    return this.services.find();
  }

  /** Registers a new employee so they can appear in the identity switcher
   * and submit requests. Validates the three required fields and that the
   * id isn't already taken before creating the row — the "verification"
   * step the frontend's success toast reports on. */
  async createEmployee(id: string, fullName: string, department: string): Promise<Employee> {
    const trimmedId = id?.trim();
    const trimmedName = fullName?.trim();
    const trimmedDepartment = department?.trim();

    if (!trimmedId || !trimmedName || !trimmedDepartment) {
      throw new BadRequestException('"id", "fullName", and "department" are all required.');
    }

    const existing = await this.employees.findOneBy({ id: trimmedId });
    if (existing) {
      throw new BadRequestException(`An employee with id "${trimmedId}" already exists.`);
    }

    const employee = this.employees.create({
      id: trimmedId,
      fullName: trimmedName,
      department: trimmedDepartment,
    });
    await this.employees.save(employee);
    return employee;
  }

  /** Registers a new service so it can appear in the "request a service"
   * picker. Same shape of validation as createEmployee: all fields
   * required, id must not already be taken. */
  async createService(id: string, name: string, departmentOwner: string): Promise<Service> {
    const trimmedId = id?.trim();
    const trimmedName = name?.trim();
    const trimmedDepartmentOwner = departmentOwner?.trim();

    if (!trimmedId || !trimmedName || !trimmedDepartmentOwner) {
      throw new BadRequestException('"id", "name", and "departmentOwner" are all required.');
    }

    const existing = await this.services.findOneBy({ id: trimmedId });
    if (existing) {
      throw new BadRequestException(`A service with id "${trimmedId}" already exists.`);
    }

    const service = this.services.create({
      id: trimmedId,
      name: trimmedName,
      departmentOwner: trimmedDepartmentOwner,
    });
    await this.services.save(service);
    return service;
  }

  /** "My requests" access pattern (data-model.md section 5) when employeeId is given. */
  findAll(employeeId?: string): Promise<ServiceRequestEntity[]> {
    if (!employeeId) {
      return this.requests.find();
    }
    return this.requests.find({ where: { employeeId } });
  }

  async findOne(id: string): Promise<ServiceRequestEntity> {
    const request = await this.requests.findOneBy({ id });
    if (!request) {
      throw new NotFoundException(`No service request found with id "${id}".`);
    }
    return request;
  }

  /** Full status history, oldest first (data-model.md section 5, "full history" access pattern). */
  async getHistory(id: string): Promise<RequestStatusEventEntity[]> {
    await this.findOne(id); // throws 404 if the request itself doesn't exist
    const events = await this.events.find({ where: { requestId: id } });
    return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  /** The ops-team state-transition behaviour (Week 2). Deliberately refuses
   * CANCELLED here — that status only comes from cancelRequest(), which is
   * the one place the ownership check for it lives. */
  async changeStatus(
    id: string,
    status: RequestStatus,
    changedBy: string,
    comment?: string,
  ): Promise<ServiceRequestEntity> {
    if (!status) {
      throw new BadRequestException('"status" is required.');
    }

    if (!REQUEST_STATUSES.includes(status)) {
      throw new BadRequestException(
        `"${status}" is not a valid request status. Valid statuses: ${REQUEST_STATUSES.join(', ')}.`,
      );
    }

    if (status === 'CANCELLED') {
      throw new BadRequestException(
        'Use PATCH /api/service-requests/:id/cancel to cancel a request — it is not a status this endpoint accepts.',
      );
    }

    const actingEmployee = await this.employees.findOneBy({ id: changedBy });
    if (!actingEmployee) {
      throw new BadRequestException(
        `"${changedBy}" is not a known employee id, so this change cannot be attributed to anyone.`,
      );
    }

    const request = await this.findOne(id);

    if (!canTransition(request.currentStatus, status)) {
      throw new BadRequestException(explainRejectedTransition(request.currentStatus, status));
    }

    // Invariant (ADR-001): current_status and the event history are updated
    // together, in the same operation, so they can never drift apart.
    request.currentStatus = status;
    await this.requests.save(request);
    await this.appendEvent(request, status, changedBy, comment);

    return request;
  }

  /**
   * The Week 3 flow: an employee cancelling their own not-yet-started
   * request. Two independent checks guard this, and they fail with two
   * different, deliberate status codes:
   *
   *  - Authorization (who is asking): only the request's own owner may
   *    cancel it. Anyone else gets 403, even if the request could
   *    otherwise be cancelled right now. (data-model.md section 3, "Access")
   *  - Business rule (what state it's in): only while still SUBMITTED.
   *    Once ops has started work (IN_PROGRESS) or it has reached a terminal
   *    status, cancelling is refused with 400 — an expected failure the
   *    caller can act on, not a crash.
   */
  async cancelRequest(
    id: string,
    actingEmployeeId: string,
  ): Promise<ServiceRequestEntity> {
    const actingEmployee = await this.employees.findOneBy({ id: actingEmployeeId });
    if (!actingEmployee) {
      throw new BadRequestException(
        `"${actingEmployeeId}" is not a known employee id.`,
      );
    }

    const request = await this.findOne(id);

    if (request.employeeId !== actingEmployeeId) {
      throw new ForbiddenException(
        `"${actingEmployeeId}" cannot cancel request "${id}" — only its owner ("${request.employeeId}") can.`,
      );
    }

    if (!canCancel(request.currentStatus)) {
      throw new BadRequestException(
        `Request "${id}" is "${request.currentStatus}" and can no longer be cancelled — only a "SUBMITTED" request can be.`,
      );
    }

    request.currentStatus = 'CANCELLED';
    await this.requests.save(request);
    await this.appendEvent(request, 'CANCELLED', actingEmployeeId);

    return request;
  }

  private async appendEvent(
    request: ServiceRequestEntity,
    status: RequestStatus,
    changedBy: string,
    comment?: string,
  ): Promise<void> {
    // Invariant (data-model.md section 3, "History"): status changes are
    // never overwritten in place — always insert a new row, never mutate one.
    const event = this.events.create({
      id: await this.nextEventId(),
      requestId: request.id,
      status,
      changedBy,
      occurredAt: new Date().toISOString(),
      comment,
    });
    await this.events.save(event);
  }

  private async nextRequestId(): Promise<string> {
    const count = await this.requests.count();
    return `REQ-${1001 + count}`;
  }

  private async nextEventId(): Promise<string> {
    const count = await this.events.count();
    return `EVT-${1 + count}`;
  }
}
